# ======== Phase 2: 完整的节点添加实现 ========

from fastapi import JSONResponse
from typing import Dict, Optional
import re

async def add_node_phase2(document_id: str, request_data, document_status: Dict, 
                         tree_nodes: Dict, node_mappings: Dict, content_with_ids: str, 
                         mermaid_string: str):
    """
    Phase 2 完整实现：节点添加的完备逻辑
    包含连锁重命名和精确插入
    """
    try:
        print(f"🚀 [Phase 2] 开始处理 direction={request_data.direction}")
        
        # 验证源节点是否存在
        if request_data.sourceNodeId not in tree_nodes:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"源节点 {request_data.sourceNodeId} 不存在"}
            )
        
        source_node = tree_nodes[request_data.sourceNodeId]
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
                siblings.sort(key=lambda x: split_id(x.id)[1] or 0)
                source_index = siblings.index(source_node)
                
                # c. 判断是否需要重命名
                if source_index < len(siblings) - 1:
                    print(f"🚀 [Phase 2-right-sibling] 需要重命名：源节点不是最后一个顶级节点")
                    # d. 重命名流程：从 source_index+1 开始的所有后续兄弟节点
                    for i in range(source_index + 1, len(siblings)):
                        sibling = siblings[i]
                        old_id = sibling.id
                        old_sequence = split_id(old_id)[1]
                        new_sequence = old_sequence + 1
                        new_sibling_id = str(new_sequence)
                        
                        # 使用连锁重命名函数
                        subtree_rename_map = rename_subtree(sibling, new_sibling_id)
                        rename_map.update(subtree_rename_map)
                        print(f"🚀 [Phase 2-right-sibling] 重命名兄弟节点 {old_id} -> {new_sibling_id}")
                
                # e. 生成新节点ID
                source_sequence = split_id(source_node.id)[1]
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
                        _, old_sequence = split_id(old_id)
                        new_sequence = old_sequence + 1
                        new_sibling_id = f"{parent_node.id}.{new_sequence}"
                        
                        # 使用连锁重命名函数
                        subtree_rename_map = rename_subtree(sibling, new_sibling_id)
                        rename_map.update(subtree_rename_map)
                        print(f"🚀 [Phase 2-right-sibling] 重命名兄弟节点 {old_id} -> {new_sibling_id}")
                
                # e. 生成 newNodeId: 新节点的序号是原序号 + 1
                _, source_sequence = split_id(source_node.id)
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
                siblings.sort(key=lambda x: split_id(x.id)[1] or 0)
                source_index = siblings.index(source_node)
                
                # d. 必须重命名：从 sourceNode 开始的所有节点
                for i in range(source_index, len(siblings)):
                    sibling = siblings[i]
                    old_id = sibling.id
                    old_sequence = split_id(old_id)[1]
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
                    _, old_sequence = split_id(old_id)
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

# 辅助函数
def split_id(node_id: str) -> tuple:
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