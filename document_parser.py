"""
文档结构分析器 - 基于Markdown标题构建层级结构
实现用户提供的算法：按Markdown标题层级划分文档
"""

import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import json


@dataclass
class HeadingInfo:
    """标题信息数据类"""
    level: int
    title: str
    raw_heading: str
    start_char: int
    end_char: int


class DocumentNode:
    """文档节点类 - 表示文档的层级结构"""
    
    def __init__(self, node_id: str, level: int = 0, title: Optional[str] = None, 
                 raw_heading: Optional[str] = None):
        self.id = node_id
        self.level = level
        self.title = title
        self.raw_heading = raw_heading
        
        # 标题位置
        self.heading_start_char: Optional[int] = None
        self.heading_end_char: Optional[int] = None
        
        # 内容位置（直接隶属于该标题的内容，不含子标题）
        self.content_start_char: Optional[int] = None
        self.content_end_char: Optional[int] = None
        self.content: str = ""
        
        # 完整范围位置（包含所有子孙节点）
        self.span_start_char: Optional[int] = None
        self.span_end_char: Optional[int] = None
        
        # 树结构
        self.children: List['DocumentNode'] = []
        self.parent: Optional['DocumentNode'] = None

    def add_child(self, child: 'DocumentNode'):
        """添加子节点"""
        child.parent = self
        self.children.append(child)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            "id": self.id,
            "level": self.level,
            "title": self.title,
            "raw_heading": self.raw_heading,
            "heading_start_char": self.heading_start_char,
            "heading_end_char": self.heading_end_char,
            "content_start_char": self.content_start_char,
            "content_end_char": self.content_end_char,
            "content": self.content,
            "span_start_char": self.span_start_char,
            "span_end_char": self.span_end_char,
            "children": [child.to_dict() for child in self.children]
        }


class DocumentParser:
    """文档解析器 - 按照用户提供的算法实现"""
    
    def __init__(self):
        # 匹配Markdown标题的正则表达式
        self.heading_pattern = re.compile(r'^ *(#+)\s+(.*)\s*$', re.MULTILINE)
    
    def parse_document(self, markdown_text: str, document_id: str = "doc") -> DocumentNode:
        """
        解析Markdown文档，构建层级结构
        
        Args:
            markdown_text: Markdown文本内容
            document_id: 文档ID，用于生成节点ID
            
        Returns:
            DocumentNode: 根节点
        """
        # 第一步：扫描标题
        headings_list = self._extract_headings(markdown_text)
        
        # 第二步：构建树结构
        root = self._build_tree_structure(headings_list, markdown_text, document_id)
        
        # 第三步：后处理 - 修正范围和内容
        self._post_process_tree(root, markdown_text)
        
        return root
    
    def _extract_headings(self, markdown_text: str) -> List[HeadingInfo]:
        """
        第一步：提取所有标题信息
        """
        headings_list = []
        
        for match in self.heading_pattern.finditer(markdown_text):
            level = len(match.group(1))  # 计算#号的数量
            title = match.group(2).strip()  # 提取标题文本
            raw_heading = match.group(0).strip()  # 完整的标题行
            start_char = match.start()
            end_char = match.end()
            
            heading_info = HeadingInfo(
                level=level,
                title=title,
                raw_heading=raw_heading,
                start_char=start_char,
                end_char=end_char
            )
            headings_list.append(heading_info)
        
        return headings_list
    
    def _build_tree_structure(self, headings_list: List[HeadingInfo], 
                            markdown_text: str, document_id: str) -> DocumentNode:
        """
        第二步：构建层级结构
        """
        # 创建根节点
        root = DocumentNode(node_id=f"{document_id}_root", level=0, title="文档根")
        root.span_start_char = 0
        root.content_start_char = 0
        
        # 用栈来追踪当前的父节点
        stack = [root]
        
        # 处理前言（第一个标题前的内容）
        if headings_list and headings_list[0].start_char > 0:
            preface_node = DocumentNode(
                node_id=f"{document_id}_preface",
                level=1,
                title="引言"
            )
            preface_node.content_start_char = 0
            preface_node.content_end_char = headings_list[0].start_char
            preface_node.content = markdown_text[0:headings_list[0].start_char].strip()
            preface_node.span_start_char = 0
            preface_node.span_end_char = headings_list[0].start_char
            
            root.add_child(preface_node)
        elif not headings_list:
            # 整个文档无标题
            root.content = markdown_text
            root.content_start_char = 0
            root.content_end_char = len(markdown_text)
            root.span_start_char = 0
            root.span_end_char = len(markdown_text)
            return root
        
        # 遍历标题列表构建树
        for i, heading_info in enumerate(headings_list):
            # 确定父节点
            current_parent = stack[-1]
            
            # 根据级别关系调整栈
            if heading_info.level > current_parent.level:
                # 子节点，current_parent就是父节点
                pass
            elif heading_info.level == current_parent.level:
                # 兄弟节点，弹出当前父节点
                stack.pop()
                current_parent = stack[-1]
            else:
                # 需要向上回溯
                while stack and stack[-1].level >= heading_info.level:
                    stack.pop()
                current_parent = stack[-1]
            
            # 创建新节点
            node_id = f"{document_id}_sec_{len(current_parent.children) + 1}"
            if current_parent.id != f"{document_id}_root":
                node_id = f"{current_parent.id}_{len(current_parent.children) + 1}"
            
            new_node = DocumentNode(
                node_id=node_id,
                level=heading_info.level,
                title=heading_info.title,
                raw_heading=heading_info.raw_heading
            )
            
            # 设置标题位置
            new_node.heading_start_char = heading_info.start_char
            new_node.heading_end_char = heading_info.end_char
            
            # 设置内容和范围的初始位置
            new_node.content_start_char = heading_info.end_char
            new_node.span_start_char = heading_info.start_char
            
            # 确定结束位置
            if i == len(headings_list) - 1:
                # 最后一个标题
                next_boundary_char = len(markdown_text)
            else:
                next_boundary_char = headings_list[i + 1].start_char
            
            new_node.content_end_char = next_boundary_char
            new_node.span_end_char = next_boundary_char
            
            # 提取内容
            new_node.content = markdown_text[new_node.content_start_char:new_node.content_end_char].strip()
            
            # 添加到父节点
            current_parent.add_child(new_node)
            
            # 更新栈
            stack.append(new_node)
        
        return root
    
    def _post_process_tree(self, root: DocumentNode, markdown_text: str):
        """
        第三步：后处理 - 修正范围与内容
        """
        # 修正span_end_char（后序遍历）
        self._fix_span_ranges(root)
        
        # 修正content和content_end_char（前序遍历）
        self._fix_content_ranges(root, markdown_text)
        
        # 确保根节点的范围是整个文档
        root.span_end_char = len(markdown_text)
    
    def _fix_span_ranges(self, node: DocumentNode):
        """后序遍历修正span_end_char"""
        # 先处理所有子节点
        for child in node.children:
            self._fix_span_ranges(child)
        
        # 如果有子节点，span_end_char应该等于最后一个子节点的span_end_char
        if node.children:
            node.span_end_char = node.children[-1].span_end_char
    
    def _fix_content_ranges(self, node: DocumentNode, markdown_text: str):
        """前序遍历修正content和content_end_char"""
        # 如果有子节点，content_end_char应该是第一个子节点标题开始之前
        if node.children:
            first_child = node.children[0]
            if first_child.heading_start_char is not None:
                node.content_end_char = min(
                    node.content_end_char or len(markdown_text),
                    first_child.heading_start_char
                )
        
        # 重新提取content
        if node.content_start_char is not None and node.content_end_char is not None:
            node.content = markdown_text[node.content_start_char:node.content_end_char].strip()
        
        # 递归处理子节点
        for child in node.children:
            self._fix_content_ranges(child, markdown_text)
    
    def parse_to_chunks(self, markdown_text: str, document_id: str = "doc") -> List[Dict[str, Any]]:
        """
        解析文档并返回分块列表，用于AI问题生成
        
        Returns:
            List[Dict]: 包含分块信息的列表
        """
        root = self.parse_document(markdown_text, document_id)
        chunks = []
        
        def collect_chunks(node: DocumentNode, chunk_index_ref: List[int]):
            """递归收集所有节点作为分块"""
            if node.content and node.content.strip():
                chunk = {
                    'chunk_id': node.id,
                    'paragraph_index': chunk_index_ref[0],
                    'content': node.content,
                    'start_char': node.content_start_char,
                    'end_char': node.content_end_char,
                    'document_id': document_id,
                    'level': node.level,
                    'title': node.title,
                    'heading': node.raw_heading
                }
                chunks.append(chunk)
                chunk_index_ref[0] += 1
            
            # 递归处理子节点
            for child in node.children:
                collect_chunks(child, chunk_index_ref)
        
        chunk_index_ref = [0]
        collect_chunks(root, chunk_index_ref)
        
        return chunks
    
    def generate_toc(self, root: DocumentNode) -> List[Dict[str, Any]]:
        """
        生成目录结构，用于前端显示
        
        Returns:
            List[Dict]: 目录项列表
        """
        toc = []
        
        def build_toc(node: DocumentNode, depth: int = 0):
            """递归构建目录"""
            if node.title and node.level > 0:  # 跳过根节点
                toc_item = {
                    'id': node.id,
                    'title': node.title,
                    'level': node.level,
                    'depth': depth,
                    'span_start_char': node.span_start_char,
                    'span_end_char': node.span_end_char,
                    'has_children': len(node.children) > 0,
                    'children': []
                }
                
                # 递归添加子节点
                for child in node.children:
                    child_toc = build_toc(child, depth + 1)
                    if child_toc:
                        toc_item['children'].extend(child_toc if isinstance(child_toc, list) else [child_toc])
                
                return [toc_item]
            else:
                # 对于根节点，直接返回其子节点的目录
                result = []
                for child in node.children:
                    child_toc = build_toc(child, depth)
                    if child_toc:
                        result.extend(child_toc if isinstance(child_toc, list) else [child_toc])
                return result
        
        return build_toc(root)


# 测试函数
def test_document_parser():
    """测试文档解析器"""
    markdown_sample = """这是文档的前言部分，没有标题。

# 第一章：介绍

这是第一章的主要内容。它包含了重要的介绍信息。

## 1.1 背景

这是1.1小节的内容，讲述了项目的背景。

## 1.2 目标

这是1.2小节的内容，描述了项目目标。

### 1.2.1 主要目标

这是主要目标的详细说明。

### 1.2.2 次要目标

这是次要目标的详细说明。

# 第二章：方法

这是第二章的内容，介绍了使用的方法。

## 2.1 数据收集

数据收集的方法和过程。

## 2.2 数据分析

数据分析的具体步骤。
"""
    
    parser = DocumentParser()
    root = parser.parse_document(markdown_sample, "test_doc")
    
    print("=== 文档结构 ===")
    print(json.dumps(root.to_dict(), ensure_ascii=False, indent=2))
    
    print("\n=== 分块信息 ===")
    chunks = parser.parse_to_chunks(markdown_sample, "test_doc")
    for chunk in chunks:
        print(f"块 {chunk['paragraph_index']}: {chunk['title']} (级别 {chunk['level']})")
        print(f"  内容: {chunk['content'][:50]}...")
        print()
    
    print("\n=== 目录结构 ===")
    toc = parser.generate_toc(root)
    print(json.dumps(toc, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    test_document_parser() 