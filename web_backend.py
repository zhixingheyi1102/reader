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

# 导入现有的思维导图生成器
from mindmap_generator import MindMapGenerator, MinimalDatabaseStub, get_logger, generate_mermaid_html

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
        "error_simple": doc_info.get("error_simple")  # 简化模式错误
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
    """根路径"""
    return {"message": "Mindmap Generator API", "docs": "/docs"}

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