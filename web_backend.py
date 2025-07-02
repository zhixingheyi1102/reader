from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import asyncio
import os
import hashlib
import tempfile
from datetime import datetime
from pathlib import Path
import logging
import base64
from typing import List, Dict, Any

# 导入现有的思维导图生成器
from mindmap_generator import MindMapGenerator, MinimalDatabaseStub, get_logger, generate_mermaid_html, DocumentOptimizer

# 导入文档解析器
from document_parser import DocumentParser

# 导入MinerU相关模块
from magic_pdf.data.data_reader_writer import FileBasedDataWriter, FileBasedDataReader
from magic_pdf.data.dataset import PymuDocDataset
from magic_pdf.model.doc_analyze_by_custom_model import doc_analyze
from magic_pdf.config.enums import SupportedPdfParseMethod

app = FastAPI(title="Mindmap Generator API", version="1.0.0")

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

# 存储AI辅助阅读问题的内存数据库
reading_questions = {}

# 存储文档结构的内存数据库
document_structures = {}

class ReadingAssistant:
    """AI辅助阅读助手"""
    
    def __init__(self):
        self.generator = MindMapGenerator()
        self.document_parser = DocumentParser()
        # 添加DocumentOptimizer实例用于AI调用
        self.optimizer = DocumentOptimizer()
    
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
    
    async def generate_questions_for_chunk(self, chunk: Dict[str, Any]) -> List[Dict[str, Any]]:
        """为文本块生成AI问题"""
        try:
            content = chunk['content']
            if len(content.strip()) < 50:  # 太短的内容不生成问题
                return []
            
            # 构建更智能的prompt，考虑标题层级
            title = chunk.get('title', '无标题内容')
            level = chunk.get('level', 0)
            heading = chunk.get('heading', '')
            
            context_info = ""
            if level > 0:
                context_info = f"这是一个{level}级标题「{title}」下的内容。"
            
            prompt = f"""你是一个AI阅读助手。请根据以下文本内容，生成1-2个读者在阅读到这里时可能会思考的、有启发性的问题。

{context_info}

文本内容：
"{content}"

请以JSON格式返回，包含问题列表：
[
  {{"question": "问题1的内容...", "type": "理解"}},
  {{"question": "问题2的内容...", "type": "思考"}}
]

要求：
1. 问题应该具有启发性和思考性，能帮助读者更深入理解
2. 问题类型可以是："理解"、"思考"、"应用"、"分析"、"评价"、"联想"
3. 问题长度适中，不超过50个字符
4. 如果内容较简单，可以只生成1个问题
5. 问题应该与该段落的主题紧密相关
"""
            
            # 使用DocumentOptimizer的generate_completion方法
            response = await self.optimizer.generate_completion(
                prompt, 
                max_tokens=500,
                task="生成阅读辅助问题"
            )
            
            if not response:
                return []
            
            # 解析JSON响应
            try:
                questions_data = self.generator._parse_llm_response(response, "array")
                questions = []
                
                for q_data in questions_data:
                    if isinstance(q_data, dict) and 'question' in q_data:
                        question = {
                            'question': q_data['question'],
                            'type': q_data.get('type', '思考'),
                            'chunk_id': chunk['chunk_id'],
                            'paragraph_index': chunk['paragraph_index'],
                            'document_id': chunk['document_id'],
                            'level': chunk.get('level', 0),
                            'title': chunk.get('title', ''),
                            'context': title
                        }
                        questions.append(question)
                
                print(f"✅ [问题生成] {title} (级别{level}) 生成 {len(questions)} 个问题")
                return questions
                
            except Exception as parse_error:
                print(f"❌ [解析错误] {str(parse_error)}")
                return []
                
        except Exception as e:
            print(f"❌ [问题生成错误] {str(e)}")
            return []
    
    async def generate_all_questions(self, document_id: str, content: str) -> Dict[str, Any]:
        """为整个文档生成所有问题"""
        try:
            print(f"🤖 [AI助手] 开始为文档 {document_id} 生成阅读辅助问题...")
            
            # 分块
            chunks = self.split_text_into_chunks(content, document_id)
            if not chunks:
                return {"success": False, "error": "文档分块失败"}
            
            # 为每个chunk生成问题（批量处理）
            all_questions = []
            for chunk in chunks:
                questions = await self.generate_questions_for_chunk(chunk)
                all_questions.extend(questions)
                
                # 避免API调用过于频繁
                await asyncio.sleep(0.5)
            
            # 存储问题
            reading_questions[document_id] = {
                'questions': all_questions,
                'chunks': chunks,
                'total_questions': len(all_questions),
                'generated_at': datetime.now().isoformat()
            }
            
            print(f"✅ [AI助手] 文档 {document_id} 共生成 {len(all_questions)} 个问题")
            return {
                "success": True, 
                "total_questions": len(all_questions),
                "questions": all_questions
            }
            
        except Exception as e:
            print(f"❌ [AI助手错误] {str(e)}")
            return {"success": False, "error": str(e)}

# 创建阅读助手实例
reading_assistant = ReadingAssistant()

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
        
        # 初始化文档状态
        document_status[document_id] = {
            "status": "uploaded",
            "content": text_content,
            "filename": file.filename,
            "file_type": file_extension,
            "original_file_path": str(original_file_path),
            "pdf_base64": pdf_base64,  # 仅PDF文件有此字段
            "mermaid_code": None,
            "error": None
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

@app.post("/api/generate-mindmap/{document_id}")
async def generate_mindmap(document_id: str, method: str = "standard"):
    """为指定文档生成思维导图
    
    Args:
        document_id: 文档ID
        method: 生成方法，"standard"(标准详细模式) 或 "simple"(快速简化模式)
    """
    
    if document_id not in document_status:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    doc_info = document_status[document_id]
    
    # 根据方法类型检查状态
    status_key = f"status_{method}" if method == "simple" else "status"
    code_key = f"mermaid_code_{method}" if method == "simple" else "mermaid_code"
    
    if doc_info.get(status_key) == "generating":
        print(f"⏳ [状态查询] 文档 {document_id} 思维导图正在生成中... (方法: {method})")
        return JSONResponse({
            "success": True,
            "status": "generating",
            "method": method,
            "message": f"思维导图正在生成中... ({method}模式)"
        })
    
    if doc_info.get(status_key) == "completed" and doc_info.get(code_key):
        print(f"✅ [状态查询] 文档 {document_id} 思维导图已生成完成 (方法: {method})")
        return JSONResponse({
            "success": True,
            "status": "completed",
            "method": method,
            "mermaid_code": doc_info[code_key],
            "message": f"思维导图已生成 ({method}模式)"
        })
    
    try:
        print(f"🔄 [开始生成] 为文档 {document_id} 启动思维导图生成任务 (方法: {method})")
        
        # 更新状态为生成中
        doc_info[status_key] = "generating"
        
        # 异步生成思维导图
        asyncio.create_task(generate_mindmap_async(document_id, doc_info["content"], method))
        
        return JSONResponse({
            "success": True,
            "status": "generating",
            "method": method,
            "message": f"开始生成思维导图... ({method}模式)"
        })
        
    except Exception as e:
        print(f"❌ [启动失败] 文档 {document_id} 思维导图生成启动失败: {str(e)} (方法: {method})")
        logger.error(f"生成思维导图时出错: {str(e)}")
        doc_info[status_key] = "error"
        doc_info[f"error_{method}"] = str(e)
        raise HTTPException(status_code=500, detail=f"生成思维导图时出错: {str(e)}")

@app.post("/api/generate-mindmap-simple/{document_id}")
async def generate_mindmap_simple(document_id: str):
    """为指定文档快速生成思维导图（简化版本）"""
    return await generate_mindmap(document_id, method="simple")

async def generate_mindmap_async(document_id: str, content: str, method: str = "standard"):
    """异步生成思维导图
    
    Args:
        document_id: 文档ID
        content: 文档内容
        method: 生成方法，"standard" 或 "simple"
    """
    try:
        method_name = "简化快速" if method == "simple" else "标准详细"
        print(f"\n🚀 [开始生成] 文档ID: {document_id} (方法: {method_name})")
        print(f"📄 [文档内容] 长度: {len(content)} 字符")
        print("=" * 60)
        
        logger.info(f"Starting {method} mindmap generation for document: {document_id}")
        generator = MindMapGenerator()
        
        print(f"🤖 [AI处理] 正在调用思维导图生成器... (方法: {method_name})")
        
        # 根据方法选择不同的生成函数
        if method == "simple":
            mermaid_syntax = await generator.generate_mindmap_simple(content, request_id=document_id)
        else:
            mermaid_syntax = await generator.generate_mindmap(content, request_id=document_id)
        
        # 更新文档状态
        status_key = f"status_{method}" if method == "simple" else "status"
        code_key = f"mermaid_code_{method}" if method == "simple" else "mermaid_code"
        
        document_status[document_id][status_key] = "completed"
        document_status[document_id][code_key] = mermaid_syntax
        
        print(f"✅ [生成完成] 文档ID: {document_id} (方法: {method_name})")
        print(f"🎯 [思维导图] 代码长度: {len(mermaid_syntax)} 字符")
        print("=" * 60)
        
        logger.info(f"{method.capitalize()} mindmap generation completed for document: {document_id}")
        
    except Exception as e:
        method_name = "简化快速" if method == "simple" else "标准详细"
        print(f"❌ [生成失败] 文档ID: {document_id}, 错误: {str(e)} (方法: {method_name})")
        print("=" * 60)
        logger.error(f"异步生成思维导图失败: {str(e)}")
        
        status_key = f"status_{method}" if method == "simple" else "status"
        error_key = f"error_{method}" if method == "simple" else "error"
        
        document_status[document_id][status_key] = "error"
        document_status[document_id][error_key] = str(e)

@app.get("/api/document-status/{document_id}")
async def get_document_status(document_id: str):
    """获取文档状态和思维导图生成进度"""
    
    if document_id not in document_status:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    doc_info = document_status[document_id]
    
    response_data = {
        "success": True,
        "document_id": document_id,
        "status": doc_info.get("status", "not_started"),  # 标准模式状态
        "status_simple": doc_info.get("status_simple", "not_started"),  # 简化模式状态
        "filename": doc_info.get("filename"),
        "content": doc_info.get("content"),
        "file_type": doc_info.get("file_type", ".md"),  # 文件类型
        "mermaid_code": doc_info.get("mermaid_code"),  # 标准模式代码
        "mermaid_code_simple": doc_info.get("mermaid_code_simple"),  # 简化模式代码
        "error": doc_info.get("error"),  # 标准模式错误
        "error_simple": doc_info.get("error_simple"),  # 简化模式错误
        # 添加阅读问题相关状态
        "reading_questions_status": doc_info.get("reading_questions_status", "not_started"),
        "has_reading_questions": document_id in reading_questions,
        "reading_questions_count": reading_questions.get(document_id, {}).get("total_questions", 0)
    }
    
    # 如果是PDF文件，添加PDF相关信息
    if doc_info.get("file_type") == ".pdf":
        response_data["pdf_base64"] = doc_info.get("pdf_base64")
        response_data["original_file_path"] = doc_info.get("original_file_path")
    
    return JSONResponse(response_data)

@app.get("/api/document/{document_id}")
async def get_document(document_id: str):
    """获取文档内容和思维导图（兼容旧API）"""
    
    try:
        # 查找文件
        file_path = UPLOAD_DIR / f"{document_id}.md"
        
        if not file_path.exists():
            # 如果文件不存在，尝试从内存状态获取
            if document_id in document_status:
                doc_info = document_status[document_id]
                return JSONResponse({
                    "success": True,
                    "document_id": document_id,
                    "content": doc_info["content"],
                    "mermaid_code": doc_info.get("mermaid_code"),
                    "status": doc_info["status"]
                })
            else:
                raise HTTPException(status_code=404, detail="文档不存在")
        
        # 读取文件内容
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查是否已有思维导图
        if document_id in document_status and document_status[document_id].get("mermaid_code"):
            mermaid_syntax = document_status[document_id]["mermaid_code"]
        else:
            # 重新生成思维导图（如果需要）
            MinimalDatabaseStub.store_text(content)
            generator = MindMapGenerator()
            mermaid_syntax = await generator.generate_mindmap(content, request_id=document_id)
        
        return JSONResponse({
            "success": True,
            "document_id": document_id,
            "content": content,
            "mermaid_code": mermaid_syntax
        })
        
    except Exception as e:
        logger.error(f"获取文档时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取文档时出错: {str(e)}")

@app.get("/api/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "message": "Mindmap Generator API is running"}

@app.get("/")
async def root():
    return {"message": "Mindmap Generator API is running"}

# AI辅助阅读相关API端点

@app.post("/api/generate-reading-questions/{document_id}")
async def generate_reading_questions(document_id: str):
    """为文档生成AI辅助阅读问题"""
    try:
        if document_id not in document_status:
            raise HTTPException(status_code=404, detail="文档不存在")
        
        document = document_status[document_id]
        content = document.get('content')
        
        if not content:
            raise HTTPException(status_code=400, detail="文档内容为空")
        
        # 检查是否已经有问题
        if document_id in reading_questions:
            existing_questions = reading_questions[document_id]
            return {
                "success": True,
                "message": "问题已存在",
                "total_questions": existing_questions['total_questions'],
                "questions": existing_questions['questions']
            }
        
        # 生成问题
        result = await reading_assistant.generate_all_questions(document_id, content)
        
        if result['success']:
            # 更新文档状态
            document_status[document_id]['reading_questions_status'] = 'completed'
            return result
        else:
            document_status[document_id]['reading_questions_status'] = 'error'
            raise HTTPException(status_code=500, detail=result.get('error', '生成问题失败'))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generate reading questions error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"生成问题失败: {str(e)}")

@app.get("/api/reading-questions/{document_id}")
async def get_reading_questions(document_id: str):
    """获取文档的AI辅助阅读问题"""
    try:
        if document_id not in reading_questions:
            return {
                "success": False,
                "message": "尚未生成问题",
                "questions": []
            }
        
        questions_data = reading_questions[document_id]
        return {
            "success": True,
            "total_questions": questions_data['total_questions'],
            "questions": questions_data['questions'],
            "chunks": questions_data['chunks'],
            "generated_at": questions_data['generated_at']
        }
        
    except Exception as e:
        logger.error(f"Get reading questions error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取问题失败: {str(e)}")

@app.get("/api/reading-questions/{document_id}/paragraph/{paragraph_index}")
async def get_questions_by_paragraph(document_id: str, paragraph_index: int):
    """获取特定段落的问题"""
    try:
        if document_id not in reading_questions:
            return {
                "success": False,
                "questions": []
            }
        
        questions_data = reading_questions[document_id]
        paragraph_questions = [
            q for q in questions_data['questions'] 
            if q['paragraph_index'] == paragraph_index
        ]
        
        return {
            "success": True,
            "questions": paragraph_questions,
            "paragraph_index": paragraph_index
        }
        
    except Exception as e:
        logger.error(f"Get paragraph questions error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取段落问题失败: {str(e)}")

@app.delete("/api/reading-questions/{document_id}")
async def delete_reading_questions(document_id: str):
    """删除文档的AI辅助阅读问题"""
    try:
        if document_id in reading_questions:
            del reading_questions[document_id]
        
        if document_id in document_status:
            document_status[document_id]['reading_questions_status'] = 'not_started'
        
        return {
            "success": True,
            "message": "问题已删除"
        }
        
    except Exception as e:
        logger.error(f"Delete reading questions error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除问题失败: {str(e)}")

# 文档结构和目录相关API端点

@app.get("/api/document-structure/{document_id}")
async def get_document_structure(document_id: str):
    """获取文档的层级结构"""
    try:
        if document_id not in document_structures:
            return {
                "success": False,
                "message": "文档结构尚未生成",
                "structure": None,
                "toc": []
            }
        
        structure_data = document_structures[document_id]
        return {
            "success": True,
            "structure": structure_data['structure'],
            "toc": structure_data['toc'],
            "chunks_count": len(structure_data['chunks'])
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