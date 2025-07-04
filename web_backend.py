from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import asyncio
import os
import hashlib
import tempfile
import re
from datetime import datetime
from pathlib import Path
import logging
import base64
from typing import List, Dict, Any
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

这个 JSON 对象必须包含两个顶级键："mermaid_string" 和 "node_mappings"。

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

关键要求：
1. 所有节点 ID 必须在 mermaid_string 中存在
2. paragraph_ids 必须严格使用原文的段落标记 [para-X]，不可修改
3. 原文的每个段落都应该被分配给至少一个节点
4. 节点的划分应该基于段落的论证功能，相关功能的段落可以组合在一个节点中
5. 流程图应该清晰展现论证的逻辑推理路径
6. 保持段落的完整性，不要拆分或重组段落内容

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
                
                print(f"✅ [论证结构分析] 成功生成包含 {len(structure_data['node_mappings'])} 个节点的流程图")
                return {
                    "success": True,
                    "mermaid_code": structure_data['mermaid_string'],
                    "node_mappings": structure_data['node_mappings']
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
    """异步生成论证结构流程图"""
    try:
        print(f"\n🚀 [开始分析] 文档ID: {document_id}")
        print(f"📄 [文档内容] 长度: {len(content)} 字符")
        print("=" * 60)
        
        # 获取已经处理过的带段落ID的内容
        print("📝 [获取段落ID] 使用已处理的段落ID内容...")
        text_with_ids = document_status[document_id]["content_with_ids"]
        if not text_with_ids:
            # 如果没有预处理的内容，重新生成（向后兼容）
            print("📝 [重新处理] 未找到预处理的段落ID内容，重新生成...")
            text_with_ids = argument_analyzer.add_paragraph_ids(content)
            document_status[document_id]["content_with_ids"] = text_with_ids
        
        # 分析论证结构
        print("🧠 [AI分析] 开始分析论证结构...")
        result = await argument_analyzer.generate_argument_structure(text_with_ids)
        
        if result["success"]:
            # 更新文档状态
            document_status[document_id]["status_demo"] = "completed"
            document_status[document_id]["mermaid_code_demo"] = result["mermaid_code"]
            document_status[document_id]["node_mappings_demo"] = result["node_mappings"]
            document_status[document_id]["content_with_ids"] = text_with_ids  # 保存带ID的内容
            
            print(f"✅ [分析完成] 文档 {document_id} 论证结构分析成功")
            print(f"📊 [生成结果] 包含 {len(result['node_mappings'])} 个论证节点")
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