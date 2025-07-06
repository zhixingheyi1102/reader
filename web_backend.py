from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import asyncio
import os
import hashlib
import tempfile
import re
from datetime import datetime
from pathlib import Path
import logging
import base64
import json

# 导入现有的思维导图生成器
from mindmap_generator import MindMapGenerator, MinimalDatabaseStub, get_logger, generate_mermaid_html, DocumentOptimizer

# 导入文档解析器
from document_parser import DocumentParser

# 导入MinerU相关模块
from magic_pdf.data.data_reader_writer import FileBasedDataWriter, FileBasedDataReader
from magic_pdf.data.dataset import PymuDocDataset
from magic_pdf.model.doc_analyze_by_custom_model import doc_analyze
from magic_pdf.config.enums import SupportedPdfParseMethod

app = FastAPI(title="Argument Structure Analyzer API", version="1.0.0")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React开发服务器
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 配置日志
logger = get_logger()

# 创建上传目录
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# 创建PDF处理目录
PDF_OUTPUT_DIR = Path("pdf_outputs")
PDF_OUTPUT_DIR.mkdir(exist_ok=True)

# 存储文档状态的内存数据库
document_status = {}

# 存储文档结构的内存数据库
document_structures = {}

# Pydantic 模型定义
class AddNodeRequest(BaseModel):
    """添加节点的请求模型"""
    sourceNodeId: str
    direction: str  # 'child', 'left-sibling', 'right-sibling'
    parentId: Optional[str] = None
    label: Optional[str] = "新节点"

class ArgumentStructureAnalyzer:
    """论证结构分析器"""
    
    def __init__(self):
        self.generator = MindMapGenerator()
        self.document_parser = DocumentParser()
        # 添加DocumentOptimizer实例用于AI调用
        self.optimizer = DocumentOptimizer()
    
    def add_paragraph_ids(self, text: str) -> str:
        """为文本的每个段落添加ID号"""
        try:
            # 按段落分割文本
            paragraphs = text.split('\n\n')
            processed_paragraphs = []
            
            for i, paragraph in enumerate(paragraphs):
                if paragraph.strip():  # 只处理非空段落
                    # 为每个段落添加ID标记
                    para_id = f"para-{i+1}"
                    processed_paragraph = f"[{para_id}] {paragraph.strip()}"
                    processed_paragraphs.append(processed_paragraph)
                else:
                    processed_paragraphs.append(paragraph)
            
            return '\n\n'.join(processed_paragraphs)
            
        except Exception as e:
            print(f"❌ [段落ID添加错误] {str(e)}")
            return text
    
    def split_text_into_chunks(self, text: str, document_id: str) -> List[Dict[str, Any]]:
        """将文档按Markdown标题层级分块并分配唯一标识符"""
        try:
            # 使用新的文档解析器
            chunks = self.document_parser.parse_to_chunks(text, document_id)
            
            # 同时保存文档结构用于目录生成
            root = self.document_parser.parse_document(text, document_id)
            toc = self.document_parser.generate_toc(root)
            
            document_structures[document_id] = {
                'structure': root.to_dict(),
                'toc': toc,
                'chunks': chunks
            }
            
            print(f"📄 [文本分块] 文档 {document_id} 分为 {len(chunks)} 个结构化块")
            for i, chunk in enumerate(chunks[:3]):  # 显示前3个块的信息
                print(f"   块 {i}: {chunk.get('title', '无标题')} (级别 {chunk.get('level', 0)})")
            
            return chunks
            
        except Exception as e:
            print(f"❌ [分块错误] {str(e)}")
            return []
    
    async def generate_argument_structure(self, text_with_ids: str) -> Dict[str, Any]:
        """使用AI分析文档的论证结构"""
        try:
            # 构建基于段落的论证结构分析prompt
            prompt = f"""我希望你扮演一个专业的学术分析师，你的任务是阅读我提供的、已经按段落标记好ID的文本，并基于现有的段落划分来分析其论证结构。

请按照以下步骤进行分析：

第一步：段落角色识别
- 基于现有的段落划分（[para-X]标记），分析每个段落在论证中的角色
- 不要重新划分段落，而是基于现有段落来理解论证逻辑
- 识别每个段落是引言、论点、证据、反驳、结论等哪种类型

第二步：构建论证结构流程图
- 基于段落的论证角色，构建逻辑流程图
- 将具有相同或相关论证功能的段落组合成逻辑节点
- 用箭头表示论证的逻辑流向和依赖关系

你的输出必须是一个单一的、完整的 JSON 对象，不要在 JSON 代码块前后添加任何额外的解释性文字。

这个 JSON 对象必须包含三个顶级键："mermaid_string"、"node_mappings" 和 "edges"。

mermaid_string:
- 值为符合 Mermaid.js 语法的流程图（graph TD）
- 图中的每个节点代表一组相关的段落（基于论证功能）
- 节点 ID 使用简短的字母或字母数字组合（如：A, B, C1, D2）
- 节点标签应该简洁概括该组段落的核心论证功能（不超过20字）
- 使用箭头 --> 表示论证的逻辑流向和依赖关系
- 可以使用不同的节点形状来区分不同类型的论证功能：
  - [方括号] 用于主要论点
  - (圆括号) 用于支撑证据
  - {{花括号}} 用于逻辑转折或关键判断

node_mappings:
- 值为 JSON 对象，键为 Mermaid 图中的节点 ID
- 每个节点对应的值包含：
  - "text_snippet": 该节点包含段落的核心内容总结（30-80字）
  - "paragraph_ids": 构成该节点的段落ID数组（如 ["para-2", "para-3"]）
  - "semantic_role": 该节点在论证中的角色（如 "引言"、"核心论点"、"支撑证据"、"反驳"、"结论" 等）

edges:
- 值为对象数组，每个对象代表一条边
- 每个对象必须包含两个键：
  - "source": 边的起始节点ID
  - "target": 边的目标节点ID
- 这些边必须与 mermaid_string 中的连接关系一致

关键要求：
1. 所有节点 ID 必须在 mermaid_string 中存在
2. paragraph_ids 必须严格使用原文的段落标记 [para-X]，不可修改
3. 原文的每个段落都应该被分配给至少一个节点
4. 节点的划分应该基于段落的论证功能，相关功能的段落可以组合在一个节点中
5. 流程图应该清晰展现论证的逻辑推理路径
6. 保持段落的完整性，不要拆分或重组段落内容
7. edges 数组中的每条边必须与 mermaid_string 中的连接关系完全一致

现在，请分析以下带有段落ID的文本：

{text_with_ids}"""
            
            # 使用DocumentOptimizer的generate_completion方法
            response = await self.optimizer.generate_completion(
                prompt, 
                max_tokens=2000,
                task="分析论证结构"
            )
            
            if not response:
                print(f"❌ [API调用失败] 未收到AI响应")
                return {"success": False, "error": "API调用失败，未收到AI响应"}
            
            # 保存API原始响应到文件
            try:
                from datetime import datetime
                import os
                
                # 创建api_responses文件夹（如果不存在）
                api_responses_dir = "api_responses"
                os.makedirs(api_responses_dir, exist_ok=True)
                
                # 生成文件名：时间戳_论证结构分析
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                response_filename = f"{timestamp}_argument_structure_analysis.txt"
                response_filepath = os.path.join(api_responses_dir, response_filename)
                
                # 保存原始响应和相关信息
                with open(response_filepath, 'w', encoding='utf-8') as f:
                    f.write("=== API调用信息 ===\n")
                    f.write(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                    f.write(f"任务: 论证结构分析\n")
                    f.write(f"最大tokens: 2000\n")
                    f.write(f"响应长度: {len(response)} 字符\n")
                    f.write(f"文本长度: {len(text_with_ids)} 字符\n")
                    f.write("\n=== 发送的Prompt ===\n")
                    f.write(prompt)
                    f.write("\n\n=== AI原始响应 ===\n")
                    f.write(response)
                    f.write(f"\n\n=== 响应结束 ===\n")
                
                print(f"💾 [API响应保存] 已保存到: {response_filepath}")
                
            except Exception as save_error:
                print(f"⚠️ [响应保存失败] {str(save_error)}")
            
            # 解析JSON响应
            try:
                # 详细记录原始响应
                print(f"🔍 [原始AI响应] 长度: {len(response)} 字符")
                print(f"🔍 [原始响应前200字符]: {response[:200]}")
                
                # 更彻底的响应清理
                clean_response = response.strip()
                
                # 移除可能的代码块标记
                if clean_response.startswith('```json'):
                    clean_response = clean_response[7:]
                elif clean_response.startswith('```'):
                    clean_response = clean_response[3:]
                    
                if clean_response.endswith('```'):
                    clean_response = clean_response[:-3]
                
                clean_response = clean_response.strip()
                
                # 移除可能的说明文字，只保留JSON部分
                json_start = clean_response.find('{')
                json_end = clean_response.rfind('}')
                
                if json_start != -1 and json_end != -1 and json_end > json_start:
                    clean_response = clean_response[json_start:json_end+1]
                    print(f"🔧 [提取JSON] 提取到JSON部分，长度: {len(clean_response)}")
                else:
                    print(f"⚠️ [JSON提取失败] 无法找到有效的JSON结构")
                
                print(f"🔍 [清理后响应前200字符]: {clean_response[:200]}")
                
                structure_data = json.loads(clean_response)
                
                # 验证必要的键
                if 'mermaid_string' not in structure_data or 'node_mappings' not in structure_data:
                    print(f"❌ [数据结构错误] 响应键: {list(structure_data.keys())}")
                    return {"success": False, "error": "AI响应格式不正确：缺少必要的键"}
                
                # 验证节点映射的结构
                node_mappings = structure_data['node_mappings']
                valid_mappings = {}
                
                for node_id, mapping in node_mappings.items():
                    if isinstance(mapping, dict):
                        # 确保必要字段存在，如果缺少semantic_role就添加默认值
                        valid_mapping = {
                            "text_snippet": mapping.get("text_snippet", "语义块内容"),
                            "paragraph_ids": mapping.get("paragraph_ids", []),
                            "semantic_role": mapping.get("semantic_role", "论证要素")
                        }
                        valid_mappings[node_id] = valid_mapping
                    else:
                        print(f"⚠️ [映射格式错误] 节点 {node_id} 的映射不是字典格式")
                
                structure_data['node_mappings'] = valid_mappings
                
                # 检查是否包含edges字段，如果没有则尝试从mermaid_string中提取
                if 'edges' not in structure_data:
                    print("⚠️ [数据结构警告] 响应中没有edges字段，将从mermaid_string中提取")
                    # 从mermaid_string中提取边关系
                    edges = []
                    mermaid_string = structure_data['mermaid_string']
                    # 匹配形如 "A --> B" 的边定义
                    edge_pattern = r'([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)'
                    for match in re.finditer(edge_pattern, mermaid_string):
                        source, target = match.groups()
                        edges.append({"source": source, "target": target})
                    structure_data['edges'] = edges
                    print(f"🔧 [自动提取] 从mermaid_string中提取了 {len(edges)} 条边")
                
                print(f"✅ [论证结构分析] 成功生成包含 {len(structure_data['node_mappings'])} 个节点的流程图")
                
                # 返回成功结果
                return {
                    "success": True,
                    "mermaid_code": structure_data['mermaid_string'],
                    "node_mappings": structure_data['node_mappings'],
                    "edges": structure_data['edges']
                }
                
            except json.JSONDecodeError as parse_error:
                print(f"❌ [JSON解析错误] {str(parse_error)}")
                print(f"❌ [完整原始响应]: {response}")
                print(f"❌ [清理后响应]: {clean_response}")
                return {"success": False, "error": f"JSON解析失败: {str(parse_error)}"}
                
        except Exception as e:
            print(f"❌ [论证结构分析错误] {str(e)}")
            # 提供降级策略 - 生成基本的论证结构
            try:
                fallback_structure = self.generate_fallback_structure(text_with_ids)
                print(f"🔄 [降级策略] 使用基本论证结构，包含 {len(fallback_structure['node_mappings'])} 个节点")
                return fallback_structure
            except Exception as fallback_error:
                print(f"❌ [降级策略失败] {str(fallback_error)}")
                return {"success": False, "error": f"AI分析失败且降级策略也失败: {str(e)}"}

    def generate_fallback_structure(self, text_with_ids: str) -> Dict[str, Any]:
        """生成基本的论证结构作为降级策略"""
        import re
        
        # 提取所有段落ID
        para_ids = re.findall(r'\[para-(\d+)\]', text_with_ids)
        
        if not para_ids:
            # 如果没有找到段落ID，创建一个基本结构
            return {
                "success": True,
                "mermaid_code": "graph TD\n    A[文档分析] --> B[主要内容]\n    B --> C[总结]",
                "node_mappings": {
                    "A": {
                        "text_snippet": "文档开始",
                        "paragraph_ids": ["para-1"],
                        "semantic_role": "引言"
                    },
                    "B": {
                        "text_snippet": "主要内容",
                        "paragraph_ids": ["para-2"],
                        "semantic_role": "核心论点"
                    },
                    "C": {
                        "text_snippet": "文档结论",
                        "paragraph_ids": ["para-3"],
                        "semantic_role": "结论"
                    }
                }
            }
        
        # 基于段落数量生成结构
        total_paras = len(para_ids)
        
        if total_paras <= 3:
            # 简单线性结构
            mermaid_code = "graph TD\n"
            mermaid_code += "    A[引言] --> B[主体]\n"
            mermaid_code += "    B --> C[结论]"
            
            node_mappings = {
                "A": {
                    "text_snippet": "文档引言部分",
                    "paragraph_ids": [f"para-{para_ids[0]}"],
                    "semantic_role": "引言"
                },
                "B": {
                    "text_snippet": "文档主体内容",
                    "paragraph_ids": [f"para-{pid}" for pid in para_ids[1:-1]] if total_paras > 2 else [f"para-{para_ids[1]}"] if total_paras > 1 else [],
                    "semantic_role": "核心论点"
                },
                "C": {
                    "text_snippet": "文档结论",
                    "paragraph_ids": [f"para-{para_ids[-1]}"] if total_paras > 1 else [],
                    "semantic_role": "结论"
                }
            }
        else:
            # 复杂结构：引言 -> 多个论点 -> 结论
            mermaid_code = "graph TD\n"
            mermaid_code += "    A[引言] --> B[论点1]\n"
            mermaid_code += "    A --> C[论点2]\n"
            if total_paras > 5:
                mermaid_code += "    A --> D[论点3]\n"
                mermaid_code += "    B --> E[结论]\n"
                mermaid_code += "    C --> E\n"
                mermaid_code += "    D --> E"
            else:
                mermaid_code += "    B --> D[结论]\n"
                mermaid_code += "    C --> D"
            
            # 将段落分配给不同节点
            para_per_section = max(1, total_paras // 4)
            
            node_mappings = {
                "A": {
                    "text_snippet": "文档引言",
                    "paragraph_ids": [f"para-{para_ids[0]}"],
                    "semantic_role": "引言"
                },
                "B": {
                    "text_snippet": "第一个论点",
                    "paragraph_ids": [f"para-{pid}" for pid in para_ids[1:1+para_per_section]],
                    "semantic_role": "核心论点"
                },
                "C": {
                    "text_snippet": "第二个论点", 
                    "paragraph_ids": [f"para-{pid}" for pid in para_ids[1+para_per_section:1+2*para_per_section]],
                    "semantic_role": "支撑证据"
                }
            }
            
            if total_paras > 5:
                node_mappings["D"] = {
                    "text_snippet": "第三个论点",
                    "paragraph_ids": [f"para-{pid}" for pid in para_ids[1+2*para_per_section:-1]],
                    "semantic_role": "补充论证"
                }
                node_mappings["E"] = {
                    "text_snippet": "文档结论",
                    "paragraph_ids": [f"para-{para_ids[-1]}"],
                    "semantic_role": "结论"
                }
            else:
                node_mappings["D"] = {
                    "text_snippet": "文档结论",
                    "paragraph_ids": [f"para-{pid}" for pid in para_ids[1+2*para_per_section:]],
                    "semantic_role": "结论"
                }
        
        return {
            "success": True,
            "mermaid_code": mermaid_code,
            "node_mappings": node_mappings
        }

# 创建全局分析器实例
argument_analyzer = ArgumentStructureAnalyzer()

async def process_pdf_to_markdown(pdf_file_path: str, document_id: str) -> str:
    """
    使用MinerU处理PDF文件，转换为Markdown格式
    
    Args:
        pdf_file_path: PDF文件路径
        document_id: 文档ID
        
    Returns:
        转换后的Markdown内容
    """
    try:
        print(f"\n📄 [MinerU-PDF处理] 开始处理PDF文件")
        print(f"    📁 文件路径: {pdf_file_path}")
        print(f"    🆔 文档ID: {document_id}")
        print("=" * 60)
        
        # 创建输出目录
        output_dir = PDF_OUTPUT_DIR / document_id
        image_dir = output_dir / "images"
        os.makedirs(image_dir, exist_ok=True)
        
        print(f"📁 [MinerU-目录] 创建输出目录: {output_dir}")
        print(f"🖼️  [MinerU-图片] 图片目录: {image_dir}")
        
        # 创建数据读写器
        print("🔧 [MinerU-初始化] 创建数据读写器...")
        reader = FileBasedDataReader("")
        image_writer = FileBasedDataWriter(str(image_dir))
        md_writer = FileBasedDataWriter(str(output_dir))
        
        # 读取PDF文件
        print("📖 [MinerU-读取] 正在读取PDF文件...")
        pdf_bytes = reader.read(pdf_file_path)
        print(f"📊 [MinerU-数据] PDF文件大小: {len(pdf_bytes)} 字节")
        
        # 创建数据集实例
        print("🏗️  [MinerU-数据集] 创建PymuDocDataset实例...")
        ds = PymuDocDataset(pdf_bytes)
        
        # 分类处理模式
        print("🔍 [MinerU-检测] 检测PDF处理模式...")
        pdf_mode = ds.classify()
        
        # 进行推理
        if pdf_mode == SupportedPdfParseMethod.OCR:
            print(f"🔤 [MinerU-OCR模式] 检测到需要OCR处理，开始文字识别...")
            print("    📸 正在提取图片中的文字...")
            print("    🧠 调用OCR引擎进行文字识别...")
            infer_result = ds.apply(doc_analyze, ocr=True)
            
            print("⚡ [MinerU-管道] 使用OCR模式管道处理...")
            pipe_result = infer_result.pipe_ocr_mode(image_writer)
            print("✅ [MinerU-OCR] OCR处理完成")
        else:
            print(f"📝 [MinerU-文本模式] 检测到可直接提取文本，开始文本处理...")
            print("    📄 正在提取PDF中的文本内容...")
            print("    🔧 分析文档结构和版面...")
            infer_result = ds.apply(doc_analyze, ocr=False)
            
            print("⚡ [MinerU-管道] 使用文本模式管道处理...")
            pipe_result = infer_result.pipe_txt_mode(image_writer)
            print("✅ [MinerU-文本] 文本提取完成")
        
        print("📋 [MinerU-转换] 正在生成Markdown格式...")
        # 获取Markdown内容
        markdown_content = pipe_result.get_markdown("images")
        
        # 保存Markdown文件
        md_file_path = output_dir / f"{document_id}.md"
        print(f"💾 [MinerU-保存] 保存Markdown文件: {md_file_path}")
        with open(md_file_path, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        
        # 统计信息
        lines_count = len(markdown_content.split('\n'))
        words_count = len(markdown_content.split())
        
        print("=" * 60)
        print("✅ [MinerU-完成] PDF转换成功完成！")
        print(f"    📊 生成内容统计:")
        print(f"       • Markdown总长度: {len(markdown_content):,} 字符")
        print(f"       • 总行数: {lines_count:,} 行")
        print(f"       • 单词数: {words_count:,} 个")
        print(f"    📁 输出文件: {md_file_path}")
        print("=" * 60)
        
        return markdown_content
        
    except Exception as e:
        print("=" * 60)
        print(f"❌ [MinerU-错误] PDF处理失败！")
        print(f"    🚨 错误信息: {str(e)}")
        print(f"    📄 文件路径: {pdf_file_path}")
        print(f"    🆔 文档ID: {document_id}")
        print("=" * 60)
        logger.error(f"MinerU PDF processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"PDF处理失败: {str(e)}")

@app.post("/api/upload-document")
async def upload_document(file: UploadFile = File(...)):
    """上传文档，支持PDF、MD和TXT文件"""
    
    # 验证文件类型
    allowed_extensions = ['.md', '.txt', '.pdf']
    file_extension = Path(file.filename).suffix.lower()
    
    if file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="只支持 .md、.txt 和 .pdf 文件")
    
    try:
        # 读取文件内容
        content = await file.read()
        
        # 生成唯一的文档ID
        content_hash = hashlib.md5(content).hexdigest()[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = Path(file.filename).stem
        document_id = f"{base_filename}_{content_hash}_{timestamp}"
        
        print(f"\n📤 [文件上传] {file.filename}")
        print(f"🆔 [文档ID] {document_id}")
        print(f"📊 [文件大小] {len(content)} 字节")
        print(f"📋 [文件类型] {file_extension}")
        
        # 保存原始文件
        original_file_path = UPLOAD_DIR / f"{document_id}{file_extension}"
        with open(original_file_path, 'wb') as f:
            f.write(content)
        
        # 根据文件类型处理内容
        if file_extension == '.pdf':
            # 处理PDF文件
            print(f"🔄 [PDF处理] 开始转换PDF为Markdown...")
            markdown_content = await process_pdf_to_markdown(str(original_file_path), document_id)
            text_content = markdown_content
            
            # 将原始PDF文件编码为base64用于前端显示
            pdf_base64 = base64.b64encode(content).decode('utf-8')
            
        else:
            # 处理文本文件
            text_content = content.decode('utf-8')
            pdf_base64 = None
        
        # 存储到内存数据库
        MinimalDatabaseStub.store_text(text_content)
        
        # 立即为文档内容添加段落ID，无需等待生成论证结构
        print("📝 [处理段落] 为上传的文档添加段落ID标记...")
        content_with_ids = argument_analyzer.add_paragraph_ids(text_content)
        print(f"📝 [段落处理完成] 已为文档添加段落ID，内容长度: {len(content_with_ids)} 字符")
        
        # 初始化文档状态
        document_status[document_id] = {
            "status": "uploaded",
            "content": text_content,
            "filename": file.filename,
            "file_type": file_extension,
            "original_file_path": str(original_file_path),
            "pdf_base64": pdf_base64,  # 仅PDF文件有此字段
            "status_demo": "not_started",
            "mermaid_code_demo": None,
            "node_mappings_demo": {},
            "error_demo": None,
            "content_with_ids": content_with_ids  # 立即设置带段落ID的内容
        }
        
        print(f"✅ [上传成功] 文档已保存并准备生成思维导图")
        print("=" * 60)
        
        logger.info(f"Document uploaded: {document_id}")
        
        # 返回文档信息
        response_data = {
            "success": True,
            "document_id": document_id,
            "filename": file.filename,
            "content": text_content,
            "file_type": file_extension,
            "status": "uploaded",
            "message": "文档上传成功"
        }
        
        # 如果是PDF文件，返回base64编码的原始PDF
        if file_extension == '.pdf':
            response_data["pdf_base64"] = pdf_base64
            response_data["message"] = "PDF文件上传成功，已转换为Markdown"
        
        return JSONResponse(response_data)
        
    except UnicodeDecodeError:
        print(f"❌ [编码错误] 文件: {file.filename}")
        raise HTTPException(status_code=400, detail="文件编码错误，请确保文件是UTF-8编码")
    except Exception as e:
        print(f"❌ [上传失败] 文件: {file.filename}, 错误: {str(e)}")
        logger.error(f"处理文件时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"处理文件时出错: {str(e)}")

@app.get("/api/document-pdf/{document_id}")
async def get_document_pdf(document_id: str):
    """获取原始PDF文件"""
    
    if document_id not in document_status:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    doc_info = document_status[document_id]
    
    if doc_info.get("file_type") != ".pdf":
        raise HTTPException(status_code=400, detail="该文档不是PDF文件")
    
    original_file_path = doc_info.get("original_file_path")
    if not original_file_path or not os.path.exists(original_file_path):
        raise HTTPException(status_code=404, detail="原始PDF文件不存在")
    
    return FileResponse(
        path=original_file_path,
        media_type='application/pdf',
        filename=doc_info["filename"]
    )

@app.post("/api/generate-argument-structure/{document_id}")
async def generate_argument_structure(document_id: str):
    """为指定文档生成论证结构流程图"""
    
    if document_id not in document_status:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    doc_info = document_status[document_id]
    
    # 检查状态
    if doc_info.get("status_demo") == "generating":
        print(f"⏳ [状态查询] 文档 {document_id} 论证结构正在分析中...")
        return JSONResponse({
            "success": True,
            "status": "generating",
            "message": "论证结构正在分析中..."
        })
    
    if doc_info.get("status_demo") == "completed" and doc_info.get("mermaid_code_demo"):
        print(f"✅ [状态查询] 文档 {document_id} 论证结构已分析完成")
        return JSONResponse({
            "success": True,
            "status": "completed",
            "mermaid_code": doc_info["mermaid_code_demo"],
            "node_mappings": doc_info.get("node_mappings_demo", {}),
            "message": "论证结构已生成"
        })
    
    try:
        print(f"🔄 [开始分析] 为文档 {document_id} 启动论证结构分析任务")
        
        # 更新状态为分析中
        doc_info["status_demo"] = "generating"
        
        # 异步生成论证结构
        asyncio.create_task(generate_argument_structure_async(document_id, doc_info["content"]))
        
        return JSONResponse({
            "success": True,
            "status": "generating",
            "message": "开始分析论证结构..."
        })
        
    except Exception as e:
        print(f"❌ [启动失败] 文档 {document_id} 论证结构分析启动失败: {str(e)}")
        logger.error(f"生成论证结构时出错: {str(e)}")
        doc_info["status_demo"] = "error"
        doc_info["error_demo"] = str(e)
        raise HTTPException(status_code=500, detail=f"生成论证结构时出错: {str(e)}")

async def generate_argument_structure_async(document_id: str, content: str):
    """异步生成论证结构"""
    try:
        print(f"🔄 [异步任务] 开始为文档 {document_id} 生成论证结构")
        argument_analyzer = ArgumentStructureAnalyzer()
        
        # 为文本添加段落ID
        text_with_ids = argument_analyzer.add_paragraph_ids(content)
        
        # 生成论证结构
        result = await argument_analyzer.generate_argument_structure(text_with_ids)
        
        if result["success"]:
            # 🆕 使用AI返回的node_mappings重建包含物理分割栏的内容
            rebuilt_content = rebuild_content_with_physical_dividers(text_with_ids, result["node_mappings"])
            
            # 更新文档状态
            document_status[document_id]["status_demo"] = "completed"
            document_status[document_id]["mermaid_code_demo"] = result["mermaid_code"]
            document_status[document_id]["node_mappings_demo"] = result["node_mappings"]
            document_status[document_id]["edges_demo"] = result["edges"]  # 保存edges数据
            document_status[document_id]["content_with_ids"] = rebuilt_content  # 🆕 使用重建的内容
            
            print(f"✅ [分析完成] 文档 {document_id} 论证结构分析成功")
            print(f"📊 [生成结果] 包含 {len(result['node_mappings'])} 个论证节点和 {len(result['edges'])} 条边")
            print(f"🔧 [内容重建] 已重建包含物理分割栏的内容，长度: {len(rebuilt_content)} 字符")
        else:
            # 分析失败
            document_status[document_id]["status_demo"] = "error"
            document_status[document_id]["error_demo"] = result["error"]
            print(f"❌ [分析失败] 文档 {document_id}: {result['error']}")
            
    except Exception as e:
        print(f"❌ [异步分析错误] 文档 {document_id}: {str(e)}")
        logger.error(f"异步生成论证结构时出错: {str(e)}")
        document_status[document_id]["status_demo"] = "error"
        document_status[document_id]["error_demo"] = str(e)

def rebuild_content_with_physical_dividers(text_with_ids: str, node_mappings: Dict) -> str:
    """
    根据AI返回的node_mappings重建包含物理分割栏的内容
    
    Args:
        text_with_ids: 包含段落ID标记的原始文本
        node_mappings: AI返回的节点映射，包含paragraph_ids
        
    Returns:
        重建的包含物理分割栏的内容字符串
    """
    try:
        print(f"🔧 [内容重建] 开始重建包含物理分割栏的内容")
        print(f"🔧 [内容重建] 输入内容长度: {len(text_with_ids)} 字符")
        print(f"🔧 [内容重建] 节点数量: {len(node_mappings)}")
        
        # 第一步：解析原始内容，提取段落ID和对应的内容
        paragraph_content_map = {}
        
        # 按段落分割内容，保留段落ID标记
        parts = re.split(r'(\[para-\d+\])', text_with_ids)
        current_paragraph_id = None
        current_content = ''
        
        for part in parts:
            # 检查是否是段落ID标记
            para_match = re.match(r'\[para-(\d+)\]', part.strip())
            if para_match:
                # 保存之前的段落内容
                if current_paragraph_id and current_content.strip():
                    paragraph_content_map[current_paragraph_id] = current_content.strip()
                
                # 设置新的段落ID
                current_paragraph_id = f"para-{para_match.group(1)}"
                current_content = ''
                print(f"🔧 [内容重建] 发现段落: {current_paragraph_id}")
            else:
                # 累积内容
                if part.strip():  # 只添加非空内容
                    current_content += part
        
        # 处理最后一个段落
        if current_paragraph_id and current_content.strip():
            paragraph_content_map[current_paragraph_id] = current_content.strip()
        
        print(f"🔧 [内容重建] 解析出 {len(paragraph_content_map)} 个段落")
        
        # 第二步：按照node_mappings重新组织内容
        rebuilt_content_parts = []
        
        # 遍历所有节点，按照它们在node_mappings中的顺序
        for node_id, node_data in node_mappings.items():
            # 添加物理分割栏
            rebuilt_content_parts.append(f"--- {node_id} ---\n")
            print(f"🔧 [内容重建] 处理节点: {node_id}")
            
            # 获取该节点包含的段落ID列表
            paragraph_ids = node_data.get('paragraph_ids', [])
            print(f"🔧 [内容重建] 节点 {node_id} 包含段落: {paragraph_ids}")
            
            # 添加该节点的所有段落内容
            node_content_parts = []
            for para_id in paragraph_ids:
                if para_id in paragraph_content_map:
                    para_content = paragraph_content_map[para_id]
                    # 保留段落ID标记
                    node_content_parts.append(f"[{para_id}] {para_content}")
                    print(f"🔧 [内容重建] 添加段落 {para_id}，内容长度: {len(para_content)}")
                else:
                    print(f"⚠️ [内容重建] 警告: 段落 {para_id} 在原内容中未找到")
            
            # 将节点的所有段落内容合并
            if node_content_parts:
                rebuilt_content_parts.append('\n\n'.join(node_content_parts))
                rebuilt_content_parts.append('\n\n')  # 节点间的分隔
        
        # 第三步：合并所有部分
        rebuilt_content = ''.join(rebuilt_content_parts).strip()
        
        print(f"✅ [内容重建] 重建完成")
        print(f"✅ [内容重建] 重建后内容长度: {len(rebuilt_content)} 字符")
        print(f"✅ [内容重建] 包含 {len(node_mappings)} 个物理分割栏")
        
        # 验证重建结果
        divider_count = len(re.findall(r'--- [^-]+ ---', rebuilt_content))
        print(f"✅ [内容重建] 验证: 找到 {divider_count} 个分割栏")
        
        # 打印重建内容的前200字符用于调试
        print(f"🔍 [内容重建] 重建内容前200字符:")
        print(f"   {rebuilt_content[:200]}...")
        
        return rebuilt_content
        
    except Exception as e:
        print(f"❌ [内容重建错误] {str(e)}")
        import traceback
        traceback.print_exc()
        # 出错时返回原始内容
        return text_with_ids

@app.get("/api/document-status/{document_id}")
async def get_document_status(document_id: str):
    """获取文档状态和论证结构分析进度"""
    
    if document_id not in document_status:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    doc_info = document_status[document_id]
    
    response_data = {
        "success": True,
        "document_id": document_id,
        "filename": doc_info.get("filename"),
        "content": doc_info.get("content"),
        "file_type": doc_info.get("file_type", ".md"),
        
        # 论证结构分析状态
        "status_demo": doc_info.get("status_demo", "not_started"),
        "mermaid_code_demo": doc_info.get("mermaid_code_demo"),
        "node_mappings_demo": doc_info.get("node_mappings_demo", {}),
        "edges_demo": doc_info.get("edges_demo", []),
        "error_demo": doc_info.get("error_demo"),
        "content_with_ids": doc_info.get("content_with_ids"),
    }
    
    # 如果是PDF文件，添加PDF相关信息
    if doc_info.get("file_type") == ".pdf":
        response_data["pdf_base64"] = doc_info.get("pdf_base64")
        response_data["original_file_path"] = doc_info.get("original_file_path")
    
    return JSONResponse(response_data)

@app.get("/api/document/{document_id}")
async def get_document(document_id: str):
    """获取文档内容和论证结构"""
    
    try:
        # 如果文件在内存状态中存在，直接返回
        if document_id in document_status:
            doc_info = document_status[document_id]
            return JSONResponse({
                "success": True,
                "document_id": document_id,
                "content": doc_info["content"],
                "filename": doc_info.get("filename", ""),
                "file_type": doc_info.get("file_type", ".md"),
                "mermaid_code_demo": doc_info.get("mermaid_code_demo"),
                "node_mappings_demo": doc_info.get("node_mappings_demo", {}),
                "edges_demo": doc_info.get("edges_demo", []),
                "status_demo": doc_info.get("status_demo", "not_started"),
                "error_demo": doc_info.get("error_demo"),
                "content_with_ids": doc_info.get("content_with_ids"),
                "pdf_base64": doc_info.get("pdf_base64")
            })
        else:
            # 尝试查找文件
            file_path = UPLOAD_DIR / f"{document_id}.md"
            
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="文档不存在")
            
            # 读取文件内容
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return JSONResponse({
                "success": True,
                "document_id": document_id,
                "content": content,
                "filename": f"{document_id}.md",
                "file_type": ".md",
                "mermaid_code_demo": None,
                "node_mappings_demo": {},
                "edges_demo": [],
                "status_demo": "not_started",
                "error_demo": None,
                "content_with_ids": None
            })
        
    except Exception as e:
        logger.error(f"获取文档时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取文档时出错: {str(e)}")

@app.get("/api/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "message": "Argument Structure Analyzer API is running"}

@app.get("/")
async def root():
    return {"message": "Argument Structure Analyzer API is running"}

# 文档结构相关API端点（保留用于目录生成等）

# 文档结构和目录相关API端点

@app.get("/api/document-structure/{document_id}")
async def get_document_structure(document_id: str):
    """获取文档的层级结构"""
    try:
        if document_id not in document_structures:
            # 如果结构不存在，尝试从文档内容生成
            if document_id in document_status:
                content = document_status[document_id].get('content')
                if content:
                    parser = DocumentParser()
                    root = parser.parse_document(content, document_id)
                    toc = parser.generate_toc(root)
                    chunks = parser.parse_to_chunks(content, document_id)
                    
                    # 保存结构
                    document_structures[document_id] = {
                        'structure': root.to_dict(),
                        'toc': toc,
                        'chunks': chunks
                    }
                    
                    print(f"📄 [自动生成] 为文档 {document_id} 生成了结构和 {len(chunks)} 个chunks")
                    
                    return {
                        "success": True,
                        "structure": root.to_dict(),
                        "toc": toc,
                        "chunks": chunks,
                        "chunks_count": len(chunks)
                    }
            
            return {
                "success": False,
                "message": "文档结构尚未生成，且无法自动生成",
                "structure": None,
                "toc": [],
                "chunks": [],
                "chunks_count": 0
            }
        
        structure_data = document_structures[document_id]
        chunks = structure_data.get('chunks', [])
        
        print(f"📄 [API] 返回文档结构，chunks数量: {len(chunks)}")
        
        return {
            "success": True,
            "structure": structure_data['structure'],
            "toc": structure_data['toc'], 
            "chunks": chunks,  # 返回实际的chunks数据
            "chunks_count": len(chunks)
        }
        
    except Exception as e:
        logger.error(f"Get document structure error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取文档结构失败: {str(e)}")

@app.get("/api/document-toc/{document_id}")
async def get_document_toc(document_id: str):
    """获取文档目录"""
    try:
        if document_id not in document_structures:
            # 如果结构不存在，尝试从文档内容生成
            if document_id in document_status:
                content = document_status[document_id].get('content')
                if content:
                    parser = DocumentParser()
                    root = parser.parse_document(content, document_id)
                    toc = parser.generate_toc(root)
                    
                    # 保存结构
                    document_structures[document_id] = {
                        'structure': root.to_dict(),
                        'toc': toc,
                        'chunks': parser.parse_to_chunks(content, document_id)
                    }
                    
                    return {
                        "success": True,
                        "toc": toc
                    }
            
            return {
                "success": False,
                "message": "文档目录尚未生成",
                "toc": []
            }
        
        structure_data = document_structures[document_id]
        return {
            "success": True,
            "toc": structure_data['toc']
        }
        
    except Exception as e:
        logger.error(f"Get document TOC error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取文档目录失败: {str(e)}")

@app.post("/api/generate-document-structure/{document_id}")
async def generate_document_structure(document_id: str):
    """生成或重新生成文档结构"""
    try:
        if document_id not in document_status:
            raise HTTPException(status_code=404, detail="文档不存在")
        
        content = document_status[document_id].get('content')
        if not content:
            raise HTTPException(status_code=400, detail="文档内容为空")
        
        # 使用文档解析器生成结构
        parser = DocumentParser()
        root = parser.parse_document(content, document_id)
        toc = parser.generate_toc(root)
        chunks = parser.parse_to_chunks(content, document_id)
        
        # 保存结构
        document_structures[document_id] = {
            'structure': root.to_dict(),
            'toc': toc,
            'chunks': chunks
        }
        
        print(f"📄 [文档结构] 为文档 {document_id} 生成了 {len(toc)} 个目录项，{len(chunks)} 个内容块")
        
        return {
            "success": True,
            "message": "文档结构生成成功",
            "toc_items": len(toc),
            "chunks_count": len(chunks)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generate document structure error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"生成文档结构失败: {str(e)}")

@app.post("/api/document/{document_id}/remap")
async def update_node_mappings(document_id: str, request_data: dict):
    """更新文档的节点映射关系"""
    try:
        print(f"📍 [API] 收到节点映射更新请求 - 文档ID: {document_id}")
        print(f"📍 [API] 新的节点映射: {request_data}")
        
        # 验证请求数据
        if 'node_mappings' not in request_data:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "缺少 node_mappings 参数"}
            )
        
        new_node_mappings = request_data['node_mappings']
        
        # 检查文档是否存在
        if document_id not in document_status:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": f"文档 {document_id} 不存在"}
            )
        
        # 更新文档状态中的节点映射
        document_status[document_id]['node_mappings_demo'] = new_node_mappings
        
        print(f"📍 [API] ✅ 成功更新文档 {document_id} 的节点映射")
        print(f"📍 [API] 更新后的映射键数量: {len(new_node_mappings)}")
        
        # 可选：保存到持久化存储（这里可以添加数据库保存逻辑）
        # TODO: 添加数据库持久化逻辑
        
        return JSONResponse(content={
            "success": True,
            "message": "节点映射更新成功",
            "document_id": document_id,
            "updated_mappings_count": len(new_node_mappings)
        })
        
    except Exception as e:
        print(f"❌ [API错误] 更新节点映射失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"更新节点映射失败: {str(e)}"}
        )

@app.post("/api/document/{document_id}/node/add")
async def add_node(document_id: str, request_data: AddNodeRequest):
    """添加新节点到文档结构"""
    try:
        print(f"🆕 [API] 收到添加节点请求 - 文档ID: {document_id}")
        print(f"🆕 [API] 请求参数: sourceNodeId={request_data.sourceNodeId}, direction={request_data.direction}, parentId={request_data.parentId}")
        
        # 检查文档是否存在
        if document_id not in document_status:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": f"文档 {document_id} 不存在"}
            )
        
        document_data = document_status[document_id]
        
        # 获取必要的文档数据
        content_with_ids = document_data.get('content_with_ids', '')
        node_mappings = document_data.get('node_mappings_demo', {})
        mermaid_string = document_data.get('mermaid_code_demo', '')
        
        if not content_with_ids:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "文档内容为空或未包含段落ID"}
            )
        
        # 生成新节点ID和标签
        new_node_id = f"node_{int(datetime.now().timestamp() * 1000)}"
        new_node_label = request_data.label or "新节点"
        
        print(f"🆕 [API] 生成新节点ID: {new_node_id}")
        
        # 解析content_with_ids以找到插入点
        updated_content = await insert_divider_in_content(
            content_with_ids, 
            request_data.sourceNodeId,
            request_data.direction,
            new_node_id,
            node_mappings
        )
        
        if updated_content is None:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "无法找到合适的插入位置"}
            )
        
        # 更新node_mappings
        updated_node_mappings = node_mappings.copy()
        updated_node_mappings[new_node_id] = {
            "text_snippet": new_node_label,
            "paragraph_ids": [],
            "semantic_role": "新添加的节点"
        }
        
        # 更新mermaid_string
        updated_mermaid = update_mermaid_string(
            mermaid_string,
            new_node_id,
            new_node_label,
            request_data.direction,
            request_data.sourceNodeId,
            request_data.parentId
        )
        
        # 更新文档状态
        document_status[document_id].update({
            'content_with_ids': updated_content,
            'node_mappings_demo': updated_node_mappings,
            'mermaid_code_demo': updated_mermaid
        })
        
        print(f"🆕 [API] ✅ 成功添加节点 {new_node_id} 到文档 {document_id}")
        print(f"🆕 [API] 📊 更新后的数据统计:")
        print(f"   content_with_ids 长度: {len(updated_content)} 字符")
        print(f"   node_mappings 数量: {len(updated_node_mappings)}")
        print(f"   mermaid_code 长度: {len(updated_mermaid)} 字符")
        print(f"🆕 [API] 📋 更新后的 content_with_ids 前200字符:")
        print(f"   {updated_content[:200]}...")
        
        # 构建返回的文档数据
        updated_document = document_status[document_id]
        
        # 验证关键数据是否存在
        if not updated_document.get('content_with_ids'):
            print(f"❌ [API] 警告: 返回数据中 content_with_ids 为空")
        if not updated_document.get('node_mappings_demo'):
            print(f"❌ [API] 警告: 返回数据中 node_mappings_demo 为空")
        if not updated_document.get('mermaid_code_demo'):
            print(f"❌ [API] 警告: 返回数据中 mermaid_code_demo 为空")
        
        print(f"🆕 [API] 📤 返回给前端的数据包含以下字段:")
        print(f"   {list(updated_document.keys())}")
        
        # 返回更新后的完整文档
        return JSONResponse(content={
            "success": True,
            "message": "节点添加成功",
            "document": updated_document,
            "new_node_id": new_node_id
        })
        
    except Exception as e:
        print(f"❌ [API错误] 添加节点失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"添加节点失败: {str(e)}"}
        )

async def insert_divider_in_content(content: str, source_node_id: str, direction: str, new_node_id: str, node_mappings: Dict) -> Optional[str]:
    """
    在content_with_ids中插入新的分割栏标记
    使用精确的字符串操作，根据direction执行不同的插入策略
    """
    try:
        print(f"🔍 [精确插入] 开始插入分割栏")
        print(f"🔍 [精确插入] 源节点: {source_node_id}, 方向: {direction}, 新节点: {new_node_id}")
        print(f"🔍 [精确插入] 内容长度: {len(content)} 字符")
        
        # 创建新的分割栏标记
        new_divider = f"--- {new_node_id} ---"
        
        if direction == 'child':
            # 子节点：找到 sourceNodeId 的整个内容范围的末尾，插入新分割栏
            print(f"🔍 [精确插入-child] 处理子节点插入")
            
            # 找到源节点的分割栏位置
            source_pattern = f"--- {re.escape(source_node_id)} ---"
            source_match = re.search(source_pattern, content)
            
            if not source_match:
                print(f"❌ [精确插入-child] 未找到源节点分割栏: {source_node_id}")
                return None
            
            # 找到源节点内容范围的末尾（下一个分割栏的开始位置或文档末尾）
            next_divider_pattern = r"\n--- [^-]+ ---"
            next_match = None
            for match in re.finditer(next_divider_pattern, content[source_match.end():]):
                next_match = match
                break
            
            if next_match:
                # 在下一个分割栏前插入
                insert_pos = source_match.end() + next_match.start()
                print(f"🔍 [精确插入-child] 在位置 {insert_pos} 插入（下一个分割栏前）")
            else:
                # 在文档末尾插入
                insert_pos = len(content)
                print(f"🔍 [精确插入-child] 在位置 {insert_pos} 插入（文档末尾）")
            
            # 执行插入
            updated_content = content[:insert_pos] + f"\n\n{new_divider}\n\n" + content[insert_pos:]
            
        elif direction == 'left-sibling':
            # 左侧同级：在 --- sourceNodeId --- 这个子串的正前方插入
            print(f"🔍 [精确插入-left-sibling] 处理左侧同级插入")
            
            source_pattern = f"--- {re.escape(source_node_id)} ---"
            source_match = re.search(source_pattern, content)
            
            if not source_match:
                print(f"❌ [精确插入-left-sibling] 未找到源节点分割栏: {source_node_id}")
                return None
            
            # 在源节点分割栏正前方插入
            insert_pos = source_match.start()
            print(f"🔍 [精确插入-left-sibling] 在位置 {insert_pos} 插入（源节点分割栏前）")
            
            # 执行插入
            updated_content = content[:insert_pos] + f"{new_divider}\n\n" + content[insert_pos:]
            
        elif direction == 'right-sibling':
            # 右侧同级：构建节点树，找到子树结束位置后插入
            print(f"🔍 [精确插入-right-sibling] 处理右侧同级插入")
            
            # 构建节点树结构
            node_tree = build_node_tree_from_content(content, node_mappings)
            if not node_tree:
                print(f"❌ [精确插入-right-sibling] 无法构建节点树")
                return None
            
            # 找到源节点及其子树的结束位置
            subtree_end_pos = find_node_subtree_end(content, source_node_id, node_tree)
            if subtree_end_pos is None:
                print(f"❌ [精确插入-right-sibling] 无法找到源节点子树结束位置")
                return None
            
            print(f"🔍 [精确插入-right-sibling] 在位置 {subtree_end_pos} 插入（子树末尾后）")
            
            # 执行插入
            updated_content = content[:subtree_end_pos] + f"\n\n{new_divider}\n\n" + content[subtree_end_pos:]
            
        else:
            print(f"❌ [精确插入] 不支持的方向: {direction}")
            return None
        
        print(f"✅ [精确插入] 成功插入新分割栏，节点ID: {new_node_id}")
        print(f"✅ [精确插入] 新内容长度: {len(updated_content)} 字符")
        
        # 验证插入结果
        divider_count = len(re.findall(r'--- [^-]+ ---', updated_content))
        print(f"✅ [精确插入] 验证：更新后找到 {divider_count} 个分割栏")
        
        return updated_content
        
    except Exception as e:
        print(f"❌ [精确插入错误] {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def build_node_tree_from_content(content: str, node_mappings: Dict) -> Optional[Dict]:
    """
    从content_with_ids和mermaid连接关系构建节点树结构
    
    Returns:
        节点树字典，格式: {node_id: {'children': [child_ids], 'position': (start, end)}}
    """
    try:
        print(f"🌳 [构建节点树] 开始构建节点树")
        
        # 解析所有分割栏位置
        divider_pattern = r'--- ([^-]+) ---'
        matches = list(re.finditer(divider_pattern, content))
        
        if not matches:
            print(f"🌳 [构建节点树] 没有找到分割栏")
            return None
        
        # 构建节点位置映射
        node_positions = {}
        for i, match in enumerate(matches):
            node_id = match.group(1).strip()
            start_pos = match.start()
            # 下一个分割栏的开始位置，或文档末尾
            end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(content)
            node_positions[node_id] = (start_pos, end_pos)
            print(f"🌳 [构建节点树] 节点 {node_id}: 位置 {start_pos}-{end_pos}")
        
        # 从node_mappings构建父子关系（这里简化处理，假设节点按顺序排列）
        # 实际应该从mermaid_string解析连接关系，但这里使用位置顺序作为近似
        node_tree = {}
        node_ids = list(node_positions.keys())
        
        for i, node_id in enumerate(node_ids):
            node_tree[node_id] = {
                'children': [],
                'position': node_positions[node_id],
                'level': 0  # 简化处理，假设都是同级
            }
        
        print(f"🌳 [构建节点树] 构建完成，包含 {len(node_tree)} 个节点")
        return node_tree
        
    except Exception as e:
        print(f"❌ [构建节点树错误] {str(e)}")
        return None

def find_node_subtree_end(content: str, source_node_id: str, node_tree: Dict) -> Optional[int]:
    """
    找到源节点及其所有子孙节点构成的子树的结束位置
    
    Args:
        content: 文档内容
        source_node_id: 源节点ID
        node_tree: 节点树结构
        
    Returns:
        子树结束位置，如果找不到则返回None
    """
    try:
        print(f"🔍 [子树查找] 查找节点 {source_node_id} 的子树结束位置")
        
        if source_node_id not in node_tree:
            print(f"❌ [子树查找] 节点 {source_node_id} 不在节点树中")
            return None
        
        # 获取源节点的位置
        source_position = node_tree[source_node_id]['position']
        source_end = source_position[1]
        
        print(f"🔍 [子树查找] 源节点位置: {source_position}")
        
        # 简化实现：由于没有真正的父子关系，直接返回节点内容的结束位置
        # 在实际实现中，应该遍历所有子节点，找到最远的子孙节点位置
        
        # 查找紧接在源节点后面的子节点们（基于缩进或顺序判断）
        max_end_pos = source_end
        
        # 这里简化处理，假设同一级别的节点按顺序排列
        # 实际应该解析mermaid连接关系来确定真正的父子关系
        for node_id, node_info in node_tree.items():
            node_start, node_end = node_info['position']
            # 如果节点在源节点之后且是其子节点（这里简化判断）
            if node_start > source_end:
                # 简化：只考虑紧接着的第一个节点作为边界
                max_end_pos = node_start
                break
        
        print(f"🔍 [子树查找] 确定子树结束位置: {max_end_pos}")
        return max_end_pos
        
    except Exception as e:
        print(f"❌ [子树查找错误] {str(e)}")
        return None

def parse_content_structure(content: str, node_mappings: Dict) -> tuple:
    """解析content_with_ids的结构，返回分割栏位置和节点区域"""
    divider_positions = {}
    node_regions = {}
    
    # 查找所有分割栏
    divider_pattern = r'\n*---\s*([^-\n]+)\s*---\n*'
    matches = list(re.finditer(divider_pattern, content))
    
    print(f"🔍 [结构解析] 找到 {len(matches)} 个分割栏")
    
    for i, match in enumerate(matches):
        node_id = match.group(1).strip()
        start_pos = match.start()
        end_pos = match.end()
        
        divider_positions[node_id] = {
            'start': start_pos,
            'end': end_pos,
            'match': match
        }
        
        # 确定节点区域（从分割栏到下一个分割栏或文档末尾）
        next_divider_start = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        
        node_regions[node_id] = {
            'start': start_pos,  # 分割栏开始位置
            'end': next_divider_start,  # 下一个分割栏开始位置或文档末尾
            'content_start': end_pos,  # 实际内容开始位置（分割栏后）
            'content_end': next_divider_start  # 实际内容结束位置
        }
        
        print(f"🔍 [结构解析] 节点 {node_id}: start={start_pos}, end={next_divider_start}")
    
    return divider_positions, node_regions

def find_subtree_end(node_id: str, node_regions: Dict, content: str) -> int:
    """找到节点及其整个子树的末尾位置（用于right-sibling插入）"""
    # 这是一个简化实现，假设节点按层级顺序排列
    # 更复杂的实现需要构建实际的树结构
    if node_id in node_regions:
        return node_regions[node_id]['end']
    return len(content)

def update_mermaid_string(mermaid_string: str, new_node_id: str, new_node_label: str, direction: str, source_node_id: str, parent_id: Optional[str]) -> str:
    """更新mermaid字符串，添加新节点和连接"""
    try:
        print(f"🔄 [Mermaid更新] 开始更新，新节点: {new_node_id}, 标签: {new_node_label}")
        print(f"🔄 [Mermaid更新] 方向: {direction}, 源节点: {source_node_id}, 父节点: {parent_id}")
        print(f"🔄 [Mermaid更新] 原始Mermaid长度: {len(mermaid_string)}")
        
        updated_mermaid = mermaid_string or "graph TD"
        
        # 确保以换行符结尾
        if not updated_mermaid.endswith('\n'):
            updated_mermaid += '\n'
        
        # 添加新节点定义
        new_node_def = f"    {new_node_id}[{new_node_label}]"
        updated_mermaid += new_node_def + '\n'
        
        # 根据方向决定连接关系
        if direction == 'child':
            # 子节点：源节点指向新节点
            connection = f"    {source_node_id} --> {new_node_id}"
            print(f"🔄 [Mermaid更新] 子节点连接: {source_node_id} --> {new_node_id}")
        else:
            # 同级节点：需要找到共同的父节点
            if parent_id:
                # 如果明确提供了父节点ID，使用它
                target_parent = parent_id
                print(f"🔄 [Mermaid更新] 使用提供的父节点: {target_parent}")
            else:
                # 从现有的mermaid字符串中查找源节点的父节点
                target_parent = find_parent_node_in_mermaid(updated_mermaid, source_node_id)
                print(f"🔄 [Mermaid更新] 从Mermaid中查找到父节点: {target_parent}")
            
            if target_parent:
                connection = f"    {target_parent} --> {new_node_id}"
                print(f"🔄 [Mermaid更新] 同级节点连接: {target_parent} --> {new_node_id}")
            else:
                # 如果找不到父节点，作为根节点处理
                connection = f"    ROOT --> {new_node_id}"
                print(f"🔄 [Mermaid更新] 未找到父节点，使用ROOT连接")
        
        updated_mermaid += connection + '\n'
        
        print(f"✅ [Mermaid更新] 添加节点定义: {new_node_def}")
        print(f"✅ [Mermaid更新] 添加连接: {connection}")
        print(f"✅ [Mermaid更新] 更新后长度: {len(updated_mermaid)}")
        
        return updated_mermaid
        
    except Exception as e:
        print(f"❌ [Mermaid更新错误] {str(e)}")
        import traceback
        traceback.print_exc()
        return mermaid_string or "graph TD"

def find_parent_node_in_mermaid(mermaid_string: str, child_node_id: str) -> Optional[str]:
    """从mermaid字符串中查找指定节点的父节点"""
    try:
        print(f"🔍 [查找父节点] 在Mermaid中查找 {child_node_id} 的父节点")
        print(f"🔍 [查找父节点] Mermaid内容: {mermaid_string[:200]}...")
        
        # 改进的正则表达式：更准确地匹配节点ID和连接关系
        # 匹配形如 "parent_node --> child_node_id" 或 "parent_node --> child_node_id[label]" 的连接
        escaped_child_id = re.escape(child_node_id)
        
        # 尝试多个匹配模式
        patterns = [
            # 匹配 "parent --> child" 或 "parent --> child[label]" 或 "parent --> child "
            rf'([A-Za-z0-9_]+)\s*-->\s*{escaped_child_id}(?:\[|$|\s|-->)',
            # 匹配带空格的情况
            rf'([A-Za-z0-9_]+)\s*-->\s*{escaped_child_id}(?=\s|$|-->|\[)',
            # 匹配行结尾的情况
            rf'([A-Za-z0-9_]+)\s*-->\s*{escaped_child_id}$'
        ]
        
        for i, pattern in enumerate(patterns):
            match = re.search(pattern, mermaid_string, re.MULTILINE)
            if match:
                parent_id = match.group(1)
                print(f"🔍 [查找父节点] 使用模式 {i+1} 找到 {child_node_id} 的父节点: {parent_id}")
                return parent_id
        
        print(f"🔍 [查找父节点] 未找到 {child_node_id} 的父节点")
        return None
        
    except Exception as e:
        print(f"❌ [查找父节点错误] {str(e)}")
        return None

if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "=" * 80)
    print("🎯 智能思维导图生成器 - 后端API服务")
    print("=" * 80)
    print("📍 服务地址: http://localhost:8000")
    print("📚 API文档: http://localhost:8000/docs")
    print("🔧 服务模式: 开发模式 (支持热重载)")
    print("=" * 80)
    print("📋 控制台日志说明:")
    print("   📤 [文件上传] - 文件上传相关信息")
    print("   🔄 [开始生成] - 思维导图生成任务启动")
    print("   🚀 [开始生成] - AI处理开始")
    print("   🤖 [AI处理] - 调用思维导图生成器")
    print("   ✅ [生成完成] - 思维导图生成成功")
    print("   ❌ [生成失败] - 生成过程出现错误")
    print("   ⏳ [状态查询] - 客户端查询生成状态")
    print("=" * 80)
    print("🎯 新功能: 支持两种生成模式")
    print("   📊 标准详细模式: 3-5分钟，详细分析，高质量结果")
    print("   ⚡ 快速简化模式: 1-2分钟，基础结构，快速预览")
    print("   📋 API端点: /api/generate-mindmap/{id} 和 /api/generate-mindmap-simple/{id}")
    print("=" * 80)
    print("🚀 启动服务中...")
    print("")
    
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info") 