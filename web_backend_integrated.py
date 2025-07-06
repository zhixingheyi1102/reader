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

# ======== Phase 1: 完整的内存树数据结构 ========

class NodeTreeNode:
    """完整的树节点数据结构"""
    def __init__(self, node_id: str):
        self.id = node_id
        self.children = []  # 子节点列表，按数字顺序排序
        self.parent = None  # 父节点引用
    
    def add_child(self, child_node):
        """添加子节点并维护排序"""
        child_node.parent = self
        self.children.append(child_node)
        # 按数字顺序排序子节点
        self.children.sort(key=lambda x: self._get_sort_key(x.id))
    
    def _get_sort_key(self, node_id: str):
        """获取节点排序键"""
        parts = node_id.split('.')
        try:
            return int(parts[-1])
        except ValueError:
            return 999
    
    def get_all_descendants(self):
        """获取所有子孙节点"""
        descendants = []
        for child in self.children:
            descendants.append(child)
            descendants.extend(child.get_all_descendants())
        return descendants
    
    def get_sibling_index(self):
        """获取在父节点中的索引"""
        if self.parent is None:
            return 0
        return self.parent.children.index(self)
    
    def get_siblings(self):
        """获取所有兄弟节点（不包括自己）"""
        if self.parent is None:
            return []
        return [child for child in self.parent.children if child != self]

def build_tree_structure(node_mappings: Dict, mermaid_string: str) -> Dict[str, NodeTreeNode]:
    """构建完整的内存树结构"""
    print(f"🌳 [Phase 1] 构建树结构，节点数量: {len(node_mappings)}")
    
    # 第一步：创建所有节点
    tree_nodes = {}
    for node_id in node_mappings.keys():
        tree_nodes[node_id] = NodeTreeNode(node_id)
        print(f"🌳 [Phase 1] 创建节点: {node_id}")
    
    # 第二步：建立父子关系（基于缩进式数字ID）
    for node_id, node in tree_nodes.items():
        parent_prefix, sequence = split_id_helper(node_id)
        
        if parent_prefix is not None and parent_prefix in tree_nodes:
            parent_node = tree_nodes[parent_prefix]
            parent_node.add_child(node)
            print(f"🌳 [Phase 1] 建立关系: {parent_prefix} -> {node_id}")
    
    # 第三步：验证和调试信息
    root_nodes = [node for node in tree_nodes.values() if node.parent is None]
    print(f"🌳 [Phase 1] 根节点数量: {len(root_nodes)}")
    
    for root in root_nodes:
        print(f"🌳 [Phase 1] 根节点: {root.id}, 子节点: {[child.id for child in root.children]}")
    
    return tree_nodes

def split_id_helper(node_id: str) -> tuple:
    """将节点ID分解为父ID前缀和自己的序号"""
    if '.' not in node_id:
        try:
            return (None, int(node_id))
        except ValueError:
            return (None, None)
    
    parts = node_id.split('.')
    try:
        sequence = int(parts[-1])
        parent_prefix = '.'.join(parts[:-1])
        return (parent_prefix, sequence)
    except ValueError:
        return (None, None)

def rename_subtree(node, new_id_prefix: str) -> Dict[str, str]:
    """连锁重命名核心函数"""
    rename_map = {}
    
    def recursive_rename(current_node, new_id: str):
        old_id = current_node.id
        current_node.id = new_id
        rename_map[old_id] = new_id
        
        for i, child in enumerate(current_node.children):
            child_new_id = f"{new_id}.{i + 1}"
            recursive_rename(child, child_new_id)
    
    recursive_rename(node, new_id_prefix)
    return rename_map

async def insert_divider_phase3(content: str, source_node_id: str, direction: str, new_node_id: str) -> Optional[str]:
    """Phase 3专用的分割栏插入函数"""
    try:
        print(f"🔍 [Phase 3插入] 插入分割栏: {new_node_id}, 方向: {direction}")
        
        new_divider = f"--- {new_node_id} ---"
        
        if direction == 'child':
            # 在源节点内容范围末尾插入
            source_pattern = f"--- {re.escape(source_node_id)} ---"
            source_match = re.search(source_pattern, content)
            
            if not source_match:
                print(f"❌ [Phase 3插入] 未找到源节点分割栏: {source_node_id}")
                return None
            
            # 找到下一个分割栏或文档末尾
            next_divider_pattern = r"\n--- [^-]+ ---"
            search_start = source_match.end()
            next_match = re.search(next_divider_pattern, content[search_start:])
            
            if next_match:
                insert_pos = search_start + next_match.start()
            else:
                insert_pos = len(content)
            
            return content[:insert_pos] + f"\n\n{new_divider}\n\n" + content[insert_pos:]
            
        elif direction == 'right-sibling':
            # 在源节点子树末尾插入
            source_pattern = f"--- {re.escape(source_node_id)} ---"
            source_match = re.search(source_pattern, content)
            
            if not source_match:
                return None
            
            # 简化处理：在下一个分割栏前插入，或文档末尾
            next_divider_pattern = r"\n--- [^-]+ ---"
            search_start = source_match.end()
            next_match = re.search(next_divider_pattern, content[search_start:])
            
            if next_match:
                insert_pos = search_start + next_match.start()
            else:
                insert_pos = len(content)
            
            return content[:insert_pos] + f"\n\n{new_divider}\n\n" + content[insert_pos:]
            
        elif direction == 'left-sibling':
            # 在源节点分割栏前插入
            source_pattern = f"--- {re.escape(source_node_id)} ---"
            source_match = re.search(source_pattern, content)
            
            if not source_match:
                return None
            
            insert_pos = source_match.start()
            return content[:insert_pos] + f"{new_divider}\n\n" + content[insert_pos:]
        
        return None
        
    except Exception as e:
        print(f"❌ [Phase 3插入错误] {str(e)}")
        return None

def update_mermaid_phase3(mermaid_string: str, new_node_id: str, new_node_label: str, direction: str, source_node_id: str) -> str:
    """Phase 3专用的mermaid更新函数"""
    try:
        updated_mermaid = mermaid_string or "graph TD"
        
        if not updated_mermaid.endswith('\n'):
            updated_mermaid += '\n'
        
        # 添加新节点定义
        new_node_def = f"    {new_node_id}[{new_node_label}]"
        updated_mermaid += new_node_def + '\n'
        
        # 根据方向添加连接
        if direction == 'child':
            connection = f"    {source_node_id} --> {new_node_id}"
        else:
            # 同级节点：找到源节点的父节点
            parent_pattern = rf'([A-Za-z0-9_.]+)\s*-->\s*{re.escape(source_node_id)}'
            parent_match = re.search(parent_pattern, updated_mermaid)
            
            if parent_match:
                parent_id = parent_match.group(1)
                connection = f"    {parent_id} --> {new_node_id}"
            else:
                # 如果找不到父节点，假设是根节点
                connection = f"    ROOT --> {new_node_id}"
        
        updated_mermaid += connection + '\n'
        
        print(f"🔄 [Phase 3 Mermaid] 添加: {new_node_def}")
        print(f"🔄 [Phase 3 Mermaid] 连接: {connection}")
        
        return updated_mermaid
        
    except Exception as e:
        print(f"❌ [Phase 3 Mermaid错误] {str(e)}")
        return mermaid_string or "graph TD"

# ======== End of Phase 1 & Phase 3 支持函数 ========

app = FastAPI(title="Argument Structure Analyzer API (Integrated)", version="1.0.0")

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
- 🆕 节点 ID 必须使用缩进式数字命名方案：根节点使用 1, 2, 3，子节点使用 1.1, 1.2, 1.3，孙节点使用 1.1.1, 1.1.2 等
- 🆕 不要使用字母ID（如A, B, C），必须使用数字ID（如1, 2, 1.1, 1.2）
- 节点标签应该简洁概括该组段落的核心论证功能（不超过20字）
- 使用箭头 --> 表示论证的逻辑流向和依赖关系

node_mappings:
- 值为 JSON 对象，键为 Mermaid 图中的节点 ID（必须是数字格式，如 "1", "2", "1.1", "1.2"）
- 每个节点对应的值包含：
  - "text_snippet": 该节点包含段落的核心内容总结（30-80字）
  - "paragraph_ids": 构成该节点的段落ID数组（如 ["para-2", "para-3"]）
  - "semantic_role": 该节点在论证中的角色（如 "引言"、"核心论点"、"支撑证据"、"反驳"、"结论" 等）

edges:
- 值为对象数组，每个对象代表一条边
- 每个对象必须包含两个键：
  - "source": 边的起始节点ID（数字格式）
  - "target": 边的目标节点ID（数字格式）
- 这些边必须与 mermaid_string 中的连接关系一致

关键要求：
1. 🆕 所有节点 ID 必须使用缩进式数字命名：1, 2, 3, 1.1, 1.2, 1.1.1 等，绝对不能使用字母
2. 所有节点 ID 必须在 mermaid_string 中存在
3. paragraph_ids 必须严格使用原文的段落标记 [para-X]，不可修改
4. 原文的每个段落都应该被分配给至少一个节点
5. 节点的划分应该基于段落的论证功能，相关功能的段落可以组合在一个节点中
6. 流程图应该清晰展现论证的逻辑推理路径
7. 保持段落的完整性，不要拆分或重组段落内容
8. edges 数组中的每条边必须与 mermaid_string 中的连接关系完全一致

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
                        valid_mapping = {
                            "text_snippet": mapping.get("text_snippet", "语义块内容"),
                            "paragraph_ids": mapping.get("paragraph_ids", []),
                            "semantic_role": mapping.get("semantic_role", "论证要素")
                        }
                        valid_mappings[node_id] = valid_mapping
                
                structure_data['node_mappings'] = valid_mappings
                
                # 检查是否包含edges字段
                if 'edges' not in structure_data:
                    edges = []
                    mermaid_string = structure_data['mermaid_string']
                    edge_pattern = r'([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)'
                    for match in re.finditer(edge_pattern, mermaid_string):
                        source, target = match.groups()
                        edges.append({"source": source, "target": target})
                    structure_data['edges'] = edges
                
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
                return {"success": False, "error": f"JSON解析失败: {str(parse_error)}"}
                
        except Exception as e:
            print(f"❌ [论证结构分析错误] {str(e)}")
            return {"success": False, "error": f"AI分析失败: {str(e)}"}

# 创建全局分析器实例
argument_analyzer = ArgumentStructureAnalyzer()

def rebuild_content_with_physical_dividers(text_with_ids: str, node_mappings: Dict) -> str:
    """根据AI返回的node_mappings重建包含物理分割栏的内容"""
    try:
        print(f"🔧 [内容重建] 开始重建包含物理分割栏的内容")
        
        # 解析原始内容，提取段落ID和对应的内容
        paragraph_content_map = {}
        
        parts = re.split(r'(\[para-\d+\])', text_with_ids)
        current_paragraph_id = None
        current_content = ''
        
        for part in parts:
            para_match = re.match(r'\[para-(\d+)\]', part.strip())
            if para_match:
                if current_paragraph_id and current_content.strip():
                    paragraph_content_map[current_paragraph_id] = current_content.strip()
                
                current_paragraph_id = f"para-{para_match.group(1)}"
                current_content = ''
            else:
                if part.strip():
                    current_content += part
        
        if current_paragraph_id and current_content.strip():
            paragraph_content_map[current_paragraph_id] = current_content.strip()
        
        # 按照node_mappings重新组织内容
        rebuilt_content_parts = []
        
        for node_id, node_data in node_mappings.items():
            rebuilt_content_parts.append(f"--- {node_id} ---\n")
            
            paragraph_ids = node_data.get('paragraph_ids', [])
            node_content_parts = []
            for para_id in paragraph_ids:
                if para_id in paragraph_content_map:
                    para_content = paragraph_content_map[para_id]
                    node_content_parts.append(f"[{para_id}] {para_content}")
            
            if node_content_parts:
                rebuilt_content_parts.append('\n\n'.join(node_content_parts))
                rebuilt_content_parts.append('\n\n')
        
        rebuilt_content = ''.join(rebuilt_content_parts).strip()
        
        print(f"✅ [内容重建] 重建完成，内容长度: {len(rebuilt_content)} 字符")
        
        return rebuilt_content
        
    except Exception as e:
        print(f"❌ [内容重建错误] {str(e)}")
        return text_with_ids

@app.post("/api/upload-document")
async def upload_document(file: UploadFile = File(...)):
    """上传文档，支持PDF、MD和TXT文件"""
    
    # 验证文件类型
    allowed_extensions = ['.md', '.txt']
    file_extension = Path(file.filename).suffix.lower()
    
    if file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="只支持 .md 和 .txt 文件")
    
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
        
        # 保存原始文件
        original_file_path = UPLOAD_DIR / f"{document_id}{file_extension}"
        with open(original_file_path, 'wb') as f:
            f.write(content)
        
        # 处理文本文件
        text_content = content.decode('utf-8')
        
        # 存储到内存数据库
        MinimalDatabaseStub.store_text(text_content)
        
        # 立即为文档内容添加段落ID
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
            "status_demo": "not_started",
            "mermaid_code_demo": None,
            "node_mappings_demo": {},
            "error_demo": None,
            "content_with_ids": content_with_ids
        }
        
        print(f"✅ [上传成功] 文档已保存并准备生成思维导图")
        
        return JSONResponse({
            "success": True,
            "document_id": document_id,
            "filename": file.filename,
            "content": text_content,
            "file_type": file_extension,
            "status": "uploaded",
            "message": "文档上传成功"
        })
        
    except UnicodeDecodeError:
        print(f"❌ [编码错误] 文件: {file.filename}")
        raise HTTPException(status_code=400, detail="文件编码错误，请确保文件是UTF-8编码")
    except Exception as e:
        print(f"❌ [上传失败] 文件: {file.filename}, 错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"处理文件时出错: {str(e)}")

@app.post("/api/generate-argument-structure/{document_id}")
async def generate_argument_structure(document_id: str):
    """为指定文档生成论证结构流程图"""
    
    if document_id not in document_status:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    doc_info = document_status[document_id]
    
    # 检查状态
    if doc_info.get("status_demo") == "generating":
        return JSONResponse({
            "success": True,
            "status": "generating",
            "message": "论证结构正在分析中..."
        })
    
    if doc_info.get("status_demo") == "completed" and doc_info.get("mermaid_code_demo"):
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
        doc_info["status_demo"] = "error"
        doc_info["error_demo"] = str(e)
        raise HTTPException(status_code=500, detail=f"生成论证结构时出错: {str(e)}")

async def generate_argument_structure_async(document_id: str, content: str):
    """异步生成论证结构"""
    try:
        print(f"🔄 [异步任务] 开始为文档 {document_id} 生成论证结构")
        
        # 为文本添加段落ID
        text_with_ids = argument_analyzer.add_paragraph_ids(content)
        
        # 生成论证结构
        result = await argument_analyzer.generate_argument_structure(text_with_ids)
        
        if result["success"]:
            # 使用重建的content_with_ids
            rebuilt_content = rebuild_content_with_physical_dividers(text_with_ids, result["node_mappings"])
            
            # 更新文档状态
            document_status[document_id]["status_demo"] = "completed"
            document_status[document_id]["mermaid_code_demo"] = result["mermaid_code"]
            document_status[document_id]["node_mappings_demo"] = result["node_mappings"]
            document_status[document_id]["edges_demo"] = result["edges"]
            document_status[document_id]["content_with_ids"] = rebuilt_content
            
            print(f"✅ [分析完成] 文档 {document_id} 论证结构分析成功")
        else:
            document_status[document_id]["status_demo"] = "error"
            document_status[document_id]["error_demo"] = result["error"]
            print(f"❌ [分析失败] 文档 {document_id}: {result['error']}")
            
    except Exception as e:
        print(f"❌ [异步分析错误] 文档 {document_id}: {str(e)}")
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
        "edges_demo": doc_info.get("edges_demo", []),
        "error_demo": doc_info.get("error_demo"),
        "content_with_ids": doc_info.get("content_with_ids"),
    }
    
    return JSONResponse(response_data)

@app.get("/api/document/{document_id}")
async def get_document(document_id: str):
    """获取文档内容和论证结构"""
    
    try:
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
                "content_with_ids": doc_info.get("content_with_ids")
            })
        else:
            raise HTTPException(status_code=404, detail="文档不存在")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取文档时出错: {str(e)}")

@app.post("/api/document/{document_id}/node/add")
async def add_node(document_id: str, request_data: AddNodeRequest):
    """添加新节点到文档结构 - 使用完整的Phase 2+3逻辑"""
    try:
        print(f"🚀 [Phase 2] 收到添加节点请求 - 文档ID: {document_id}")
        print(f"🚀 [Phase 2] 请求参数: sourceNodeId={request_data.sourceNodeId}, direction={request_data.direction}, parentId={request_data.parentId}")
        
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
        
        # ======== Phase 1: 构建完整的内存树结构 ========
        print(f"🌳 [Phase 1] 开始构建内存树结构...")
        tree_nodes = build_tree_structure(node_mappings, mermaid_string)
        
        # 验证源节点是否存在
        if request_data.sourceNodeId not in tree_nodes:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"源节点 {request_data.sourceNodeId} 不存在"}
            )
        
        source_node = tree_nodes[request_data.sourceNodeId]
        print(f"🌳 [Phase 1] 源节点: {source_node.id}, 子节点数: {len(source_node.children)}")
        
        # ======== Phase 2: 完整的节点添加逻辑 ========
        print(f"🚀 [Phase 2] 开始处理 direction={request_data.direction}")
        
        rename_map = {}  # 存储所有需要重命名的映射
        new_node_id = ""
        
        if request_data.direction == 'child':
            print(f"🚀 [Phase 2-child] 处理子节点添加")
            # a. parentNode 就是 sourceNode
            parent_node = source_node
            
            # b. 获取 parentNode.children 列表，新节点的序号是 len(children) + 1
            new_sequence = len(parent_node.children) + 1
            
            # c. 生成 newNodeId (例如 1.2.3)
            new_node_id = f"{parent_node.id}.{new_sequence}"
            
            # d. 此操作不触发重命名
            print(f"🚀 [Phase 2-child] 新节点ID: {new_node_id}, 无需重命名")
            
        elif request_data.direction == 'right-sibling':
            print(f"🚀 [Phase 2-right-sibling] 处理右侧同级添加")
            
            # a. 获取 sourceNode 的父节点 parentNode
            parent_node = source_node.parent
            
            if parent_node is None:
                # 源节点是顶级节点
                print(f"🚀 [Phase 2-right-sibling] 源节点是顶级节点")
                siblings = [node for node in tree_nodes.values() if node.parent is None]
                siblings.sort(key=lambda x: split_id_helper(x.id)[1] or 0)
                source_index = siblings.index(source_node)
                
                # c. 判断是否需要重命名
                if source_index < len(siblings) - 1:
                    print(f"🚀 [Phase 2-right-sibling] 需要重命名：源节点不是最后一个顶级节点")
                    # d. 重命名流程：从 source_index+1 开始的所有后续兄弟节点
                    for i in range(source_index + 1, len(siblings)):
                        sibling = siblings[i]
                        old_id = sibling.id
                        old_sequence = split_id_helper(old_id)[1]
                        new_sequence = old_sequence + 1
                        new_sibling_id = str(new_sequence)
                        
                        # 使用连锁重命名函数
                        subtree_rename_map = rename_subtree(sibling, new_sibling_id)
                        rename_map.update(subtree_rename_map)
                        print(f"🚀 [Phase 2-right-sibling] 重命名兄弟节点 {old_id} -> {new_sibling_id}")
                
                # e. 生成新节点ID
                source_sequence = split_id_helper(source_node.id)[1]
                new_node_id = str(source_sequence + 1)
                
            else:
                # 源节点有父节点
                print(f"🚀 [Phase 2-right-sibling] 源节点父节点: {parent_node.id}")
                
                # b. 在 parentNode.children 数组中找到 sourceNode 的索引 i
                source_index = parent_node.children.index(source_node)
                
                # c. 判断是否需要重命名
                if source_index < len(parent_node.children) - 1:
                    print(f"🚀 [Phase 2-right-sibling] 需要重命名：源节点不是最后一个子节点")
                    
                    # d. 重命名流程：从 parentNode.children[i+1] 开始的所有后续兄弟节点
                    for j in range(source_index + 1, len(parent_node.children)):
                        sibling = parent_node.children[j]
                        old_id = sibling.id
                        _, old_sequence = split_id_helper(old_id)
                        new_sequence = old_sequence + 1
                        new_sibling_id = f"{parent_node.id}.{new_sequence}"
                        
                        # 使用连锁重命名函数
                        subtree_rename_map = rename_subtree(sibling, new_sibling_id)
                        rename_map.update(subtree_rename_map)
                        print(f"🚀 [Phase 2-right-sibling] 重命名兄弟节点 {old_id} -> {new_sibling_id}")
                
                # e. 生成 newNodeId: 新节点的序号是原序号 + 1
                _, source_sequence = split_id_helper(source_node.id)
                new_node_id = f"{parent_node.id}.{source_sequence + 1}"
                
        elif request_data.direction == 'left-sibling':
            print(f"🚀 [Phase 2-left-sibling] 处理左侧同级添加")
            
            # a. 获取 sourceNode 的父节点 parentNode
            parent_node = source_node.parent
            
            # c. 新节点的ID 将是 sourceNode 当前的ID
            new_node_id = source_node.id
            
            if parent_node is None:
                # 源节点是顶级节点
                print(f"🚀 [Phase 2-left-sibling] 源节点是顶级节点")
                siblings = [node for node in tree_nodes.values() if node.parent is None]
                siblings.sort(key=lambda x: split_id_helper(x.id)[1] or 0)
                source_index = siblings.index(source_node)
                
                # d. 必须重命名：从 sourceNode 开始的所有节点
                for i in range(source_index, len(siblings)):
                    sibling = siblings[i]
                    old_id = sibling.id
                    old_sequence = split_id_helper(old_id)[1]
                    new_sequence = old_sequence + 1
                    new_sibling_id = str(new_sequence)
                    
                    # 使用连锁重命名函数
                    subtree_rename_map = rename_subtree(sibling, new_sibling_id)
                    rename_map.update(subtree_rename_map)
                    print(f"🚀 [Phase 2-left-sibling] 重命名节点 {old_id} -> {new_sibling_id}")
                    
            else:
                # 源节点有父节点
                print(f"🚀 [Phase 2-left-sibling] 源节点父节点: {parent_node.id}")
                
                # b. 在 parentNode.children 数组中找到 sourceNode 的索引 i
                source_index = parent_node.children.index(source_node)
                
                # d. 必须重命名：从 sourceNode (parentNode.children[i]) 开始的所有后续兄弟节点
                for j in range(source_index, len(parent_node.children)):
                    sibling = parent_node.children[j]
                    old_id = sibling.id
                    _, old_sequence = split_id_helper(old_id)
                    new_sequence = old_sequence + 1
                    new_sibling_id = f"{parent_node.id}.{new_sequence}"
                    
                    # 使用连锁重命名函数
                    subtree_rename_map = rename_subtree(sibling, new_sibling_id)
                    rename_map.update(subtree_rename_map)
                    print(f"🚀 [Phase 2-left-sibling] 重命名节点 {old_id} -> {new_sibling_id}")
        
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"不支持的方向: {request_data.direction}"}
            )
        
        print(f"🚀 [Phase 2] 完成逻辑处理")
        print(f"🚀 [Phase 2] 新节点ID: {new_node_id}")
        print(f"🚀 [Phase 2] 需要重命名的节点数: {len(rename_map)}")
        print(f"🚀 [Phase 2] 重命名映射: {rename_map}")
        
        # ======== Phase 3: 应用变更并返回 ========
        print(f"✨ [Phase 3] 开始应用变更...")
        
        new_node_label = request_data.label or "新节点"
        
        # 1. 应用重命名：遍历所有数据结构，使用 rename_map 替换旧ID为新ID
        updated_content_with_ids = content_with_ids
        updated_node_mappings = node_mappings.copy()
        updated_mermaid_string = mermaid_string
        
        # 应用重命名到 content_with_ids
        for old_id, new_id in rename_map.items():
            old_divider = f"--- {old_id} ---"
            new_divider = f"--- {new_id} ---"
            updated_content_with_ids = updated_content_with_ids.replace(old_divider, new_divider)
            print(f"✨ [Phase 3] 更新content: {old_divider} -> {new_divider}")
        
        # 应用重命名到 node_mappings
        for old_id, new_id in rename_map.items():
            if old_id in updated_node_mappings:
                updated_node_mappings[new_id] = updated_node_mappings.pop(old_id)
                print(f"✨ [Phase 3] 更新node_mappings: {old_id} -> {new_id}")
        
        # 应用重命名到 mermaid_string
        for old_id, new_id in rename_map.items():
            pattern = rf'\b{re.escape(old_id)}\b'
            updated_mermaid_string = re.sub(pattern, new_id, updated_mermaid_string)
            print(f"✨ [Phase 3] 更新mermaid: {old_id} -> {new_id}")
        
        # 2. 插入新节点：将新节点的分割栏插入到重命名后的 content_with_ids 中
        updated_content_with_ids = await insert_divider_phase3(
            updated_content_with_ids, 
            request_data.sourceNodeId,
            request_data.direction,
            new_node_id
        )
        
        if updated_content_with_ids is None:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "无法找到合适的插入位置"}
            )
        
        # 添加新节点到 node_mappings
        updated_node_mappings[new_node_id] = {
            "text_snippet": new_node_label,
            "paragraph_ids": [],
            "semantic_role": "新添加的节点"
        }
        
        # 更新 mermaid_string，添加新节点连接
        updated_mermaid_string = update_mermaid_phase3(
            updated_mermaid_string,
            new_node_id,
            new_node_label,
            request_data.direction,
            request_data.sourceNodeId
        )
        
        # 3. 更新文档状态
        document_status[document_id].update({
            'content_with_ids': updated_content_with_ids,
            'node_mappings_demo': updated_node_mappings,
            'mermaid_code_demo': updated_mermaid_string
        })
        
        print(f"✨ [Phase 3] ✅ 成功完成所有变更")
        print(f"✨ [Phase 3] 📊 最终数据统计:")
        print(f"   content_with_ids 长度: {len(updated_content_with_ids)} 字符")
        print(f"   node_mappings 数量: {len(updated_node_mappings)}")
        print(f"   mermaid_code 长度: {len(updated_mermaid_string)} 字符")
        print(f"   重命名操作数: {len(rename_map)}")
        
        # 返回更新后的完整文档
        return JSONResponse(content={
            "success": True,
            "message": "节点添加成功",
            "document": document_status[document_id],
            "new_node_id": new_node_id,
            "rename_operations": len(rename_map)
        })
        
    except Exception as e:
        print(f"❌ [Phase 2错误] 添加节点失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"添加节点失败: {str(e)}"}
        )

@app.get("/api/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "message": "集成版本 Argument Structure Analyzer API is running", "version": "Phase2+3 Integrated"}

@app.get("/")
async def root():
    return {"message": "集成版本 Argument Structure Analyzer API is running", "phase": "Phase 2+3 Integrated"}

if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "=" * 80)
    print("🎯 智能思维导图生成器 - 集成版后端API服务 (Phase 2+3)")
    print("=" * 80)
    print("📍 服务地址: http://localhost:8001")
    print("📚 API文档: http://localhost:8001/docs")
    print("🔧 服务模式: 开发模式 (支持热重载)")
    print("🚀 新功能: 完整的Phase 2+3节点添加逻辑")
    print("   ✅ 连锁重命名支持")
    print("   ✅ 三种添加方向: child, left-sibling, right-sibling")
    print("   ✅ 缩进式数字ID命名")
    print("=" * 80)
    print("🚀 启动服务中...")
    print("")
    
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info") 