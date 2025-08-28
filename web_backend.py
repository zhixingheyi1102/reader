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
- 🆕 节点 ID 必须使用缩进式数字命名方案：根节点使用 1, 2, 3，子节点使用 1.1, 1.2, 1.3，孙节点使用 1.1.1, 1.1.2 等
- 🆕 不要使用字母ID（如A, B, C），必须使用数字ID（如1, 2, 1.1, 1.2）
- 节点标签应该简洁概括该组段落的核心论证功能（不超过20字）
- 使用箭头 --> 表示论证的逻辑流向和依赖关系
- 可以使用不同的节点形状来区分不同类型的论证功能：
  - [方括号] 用于主要论点
  - (圆括号) 用于支撑证据
  - {{花括号}} 用于逻辑转折或关键判断

node_mappings:
- 值为 JSON 对象，键为 Mermaid 图中的节点 ID（必须是数字格式，如 "1", "2", "1.1", "1.2"）
- 每个节点对应的值包含：
  - "text_snippet": 该节点包含段落的核心内容总结（10-20字）
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
            # 进一步增加max_tokens以避免响应被截断（OpenRouter日志显示finish_reason为'length'）
            response = await self.optimizer.generate_completion(
                prompt, 
                max_tokens=16000,
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
                    f.write(f"最大tokens: 16000\n")
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
                
                # 移除了有问题的fix_duplicate_keys函数，直接使用原始JSON
                
                # 清理JSON中的控制字符
                def clean_control_characters(json_str: str) -> str:
                    """清理JSON字符串中的无效控制字符"""
                    import re
                    
                    # 移除开头的反斜杠（如果存在）
                    if json_str.startswith('\\'):
                        json_str = json_str[1:]
                    
                    # 替换常见的控制字符
                    # 保留合法的转义字符，清理无效的控制字符
                    json_str = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', json_str)
                    
                    # 修复双重转义的问题
                    json_str = json_str.replace('\\\\n', '\\n')
                    json_str = json_str.replace('\\\\r', '\\r')
                    json_str = json_str.replace('\\\\t', '\\t')
                    
                    # 确保字符串中的换行符被正确转义（但不要重复转义）
                    if '\\n' not in json_str:
                        json_str = json_str.replace('\n', '\\n')
                    if '\\r' not in json_str:
                        json_str = json_str.replace('\r', '\\r')
                    if '\\t' not in json_str:
                        json_str = json_str.replace('\t', '\\t')
                    
                    return json_str
                
                clean_response = clean_control_characters(clean_response)
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
            # 🆕 检查并转换节点ID格式：如果AI返回字母ID，转换为缩进式数字ID
            converted_result = convert_node_ids_to_numeric(result)
            
            # 🆕 使用转换后的node_mappings重建包含物理分割栏的内容
            rebuilt_content = rebuild_content_with_physical_dividers(text_with_ids, converted_result["node_mappings"])
            
            # 更新文档状态
            document_status[document_id]["status_demo"] = "completed"
            document_status[document_id]["mermaid_code_demo"] = converted_result["mermaid_code"]
            document_status[document_id]["node_mappings_demo"] = converted_result["node_mappings"]
            document_status[document_id]["edges_demo"] = converted_result["edges"]  # 保存edges数据
            document_status[document_id]["content_with_ids"] = rebuilt_content  # 🆕 使用重建的内容
            
            print(f"✅ [分析完成] 文档 {document_id} 论证结构分析成功")
            print(f"📊 [生成结果] 包含 {len(converted_result['node_mappings'])} 个论证节点和 {len(converted_result['edges'])} 条边")
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
    """更新节点映射关系"""
    try:
        print(f"🔄 [重映射] 文档 {document_id} 开始更新节点映射")
        
        if document_id not in document_status:
            raise HTTPException(status_code=404, detail="文档不存在")
        
        # 获取新的节点映射
        new_node_mappings = request_data.get('node_mappings', {})
        
        if not new_node_mappings:
            raise HTTPException(status_code=400, detail="节点映射数据为空")
        
        # 更新文档状态
        document_status[document_id]['node_mappings_demo'] = new_node_mappings
        
        print(f"🔄 [重映射] 更新完成，新的节点数量: {len(new_node_mappings)}")
        
        return JSONResponse({
            "success": True,
            "message": "节点映射更新成功",
            "node_count": len(new_node_mappings)
        })
        
    except Exception as e:
        print(f"❌ [重映射错误] {str(e)}")
        raise HTTPException(status_code=500, detail=f"更新节点映射失败: {str(e)}")

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
        
        # 🆕 更新的匹配模式：支持缩进式数字ID（包含点号）
        patterns = [
            # 匹配 "parent --> child" 或 "parent --> child[label]" 或 "parent --> child "
            # 支持点号格式：1.2.3 --> 1.2.3.1
            rf'([A-Za-z0-9_.]+)\s*-->\s*{escaped_child_id}(?:\[|$|\s|-->)',
            # 匹配带空格的情况
            rf'([A-Za-z0-9_.]+)\s*-->\s*{escaped_child_id}(?=\s|$|-->|\[)',
            # 匹配行结尾的情况
            rf'([A-Za-z0-9_.]+)\s*-->\s*{escaped_child_id}$'
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

def convert_node_ids_to_numeric(analysis_result: Dict) -> Dict:
    """
    将AI返回的字母节点ID转换为缩进式数字ID
    
    Args:
        analysis_result: AI分析结果，包含mermaid_code、node_mappings、edges
        
    Returns:
        转换后的分析结果，所有节点ID都使用缩进式数字格式
    """
    try:
        print(f"🔄 [ID转换] 开始检查并转换节点ID格式")
        
        original_mappings = analysis_result.get("node_mappings", {})
        original_mermaid = analysis_result.get("mermaid_code", "")
        original_edges = analysis_result.get("edges", [])
        
        # 检查是否需要转换（如果节点ID都是数字格式，就不需要转换）
        node_ids = list(original_mappings.keys())
        needs_conversion = False
        
        for node_id in node_ids:
            # 检查是否包含非数字非点号字符
            if not re.match(r'^[0-9.]+$', node_id):
                needs_conversion = True
                break
        
        if not needs_conversion:
            print(f"✅ [ID转换] 节点ID已经是数字格式，无需转换")
            return analysis_result
        
        print(f"🔄 [ID转换] 检测到字母格式节点ID，开始转换为缩进式数字格式")
        
        # 构建字母到数字的映射表
        # 按字母顺序排序，确保转换的一致性
        sorted_node_ids = sorted(node_ids)
        id_mapping = {}
        
        # 使用简单的递增数字作为根节点ID
        for i, old_id in enumerate(sorted_node_ids):
            new_id = str(i + 1)  # 1, 2, 3, ...
            id_mapping[old_id] = new_id
            print(f"🔄 [ID转换] {old_id} -> {new_id}")
        
        # 转换node_mappings
        new_node_mappings = {}
        for old_id, mapping_data in original_mappings.items():
            new_id = id_mapping.get(old_id, old_id)
            new_node_mappings[new_id] = mapping_data
        
        # 转换mermaid_string中的节点ID
        new_mermaid = original_mermaid
        for old_id, new_id in id_mapping.items():
            # 使用单词边界确保精确匹配
            pattern = rf'\b{re.escape(old_id)}\b'
            new_mermaid = re.sub(pattern, new_id, new_mermaid)
        
        # 转换edges中的节点ID
        new_edges = []
        for edge in original_edges:
            new_edge = {
                "source": id_mapping.get(edge["source"], edge["source"]),
                "target": id_mapping.get(edge["target"], edge["target"])
            }
            new_edges.append(new_edge)
        
        converted_result = {
            "success": True,
            "mermaid_code": new_mermaid,
            "node_mappings": new_node_mappings,
            "edges": new_edges
        }
        
        print(f"✅ [ID转换] 转换完成，节点ID已统一为缩进式数字格式")
        print(f"✅ [ID转换] 转换映射表: {id_mapping}")
        
        return converted_result
        
    except Exception as e:
        print(f"❌ [ID转换错误] {str(e)}")
        # 转换失败时返回原始结果
        return analysis_result

if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "=" * 80)
    print("🎯 AI 阅读器 - 后端API服务 (完整集成版)")
    print("=" * 80)
    print("📍 服务地址: http://localhost:8000")
    print("📚 API文档: http://localhost:8000/docs")
    print("🔧 服务模式: 开发模式 (支持热重载)")
    print("=" * 80)
    print("🚀 已集成功能: 完整的节点添加系统 (Phase 2+3)")
    print("   ✅ 完整的内存树数据结构 (NodeTreeNode)")
    print("   ✅ 连锁重命名支持 (rename_subtree)")
    print("   ✅ 三种添加方向: child, left-sibling, right-sibling")
    print("   ✅ 缩进式数字ID命名 (1, 2, 1.1, 1.2, 1.1.1...)")
    print("   ✅ 智能插入位置计算")
    print("   ✅ 自动Mermaid图更新")
    print("=" * 80)
    print("📋 控制台日志说明:")
    print("   📤 [文件上传] - 文件上传相关信息")
    print("   🔄 [开始生成] - 论证结构分析任务启动")
    print("   🤖 [AI处理] - 调用论证结构分析器")
    print("   🌳 [Phase 1] - 内存树结构构建")
    print("   🚀 [Phase 2] - 节点添加逻辑处理")
    print("   ✨ [Phase 3] - 变更应用和数据更新")
    print("   ✅ [分析完成] - 论证结构分析成功")
    print("   ❌ [分析失败] - 分析过程出现错误")
    print("   ⏳ [状态查询] - 客户端查询生成状态")
    print("=" * 80)
    print("🎯 支持的功能:")
    print("   📊 智能论证结构分析")
    print("   🗂️ 文档段落自动标记")
    print("   🌐 动态节点添加与重排序")
    print("   📋 实时文档状态管理")
    print("   💾 内存数据库存储")
    print("=" * 80)
    print("🚀 启动服务中...")
    print("")
    
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")