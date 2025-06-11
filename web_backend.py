from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import os
import hashlib
import tempfile
from datetime import datetime
from pathlib import Path
import logging

# 导入现有的思维导图生成器
from mindmap_generator import MindMapGenerator, MinimalDatabaseStub, get_logger, generate_mermaid_html

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

# 存储文档状态的内存数据库
document_status = {}

@app.post("/api/upload-document")
async def upload_document(file: UploadFile = File(...)):
    """上传文档，只保存文件并返回文档信息，不立即生成思维导图"""
    
    # 验证文件类型
    if not file.filename.endswith(('.md', '.txt')):
        raise HTTPException(status_code=400, detail="只支持 .md 和 .txt 文件")
    
    try:
        # 读取文件内容
        content = await file.read()
        text_content = content.decode('utf-8')
        
        # 生成唯一的文档ID
        content_hash = hashlib.md5(text_content.encode()).hexdigest()[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = Path(file.filename).stem
        document_id = f"{base_filename}_{content_hash}_{timestamp}"
        
        print(f"\n📤 [文件上传] {file.filename}")
        print(f"🆔 [文档ID] {document_id}")
        print(f"📊 [文件大小] {len(text_content)} 字符")
        
        # 保存文件
        file_path = UPLOAD_DIR / f"{document_id}.md"
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(text_content)
        
        # 存储到内存数据库
        MinimalDatabaseStub.store_text(text_content)
        
        # 初始化文档状态
        document_status[document_id] = {
            "status": "uploaded",
            "content": text_content,
            "filename": file.filename,
            "mermaid_code": None,
            "error": None
        }
        
        print(f"✅ [上传成功] 文档已保存并准备生成思维导图")
        print("=" * 60)
        
        logger.info(f"Document uploaded: {document_id}")
        
        # 返回文档信息，不包含思维导图
        return JSONResponse({
            "success": True,
            "document_id": document_id,
            "filename": file.filename,
            "content": text_content,
            "status": "uploaded",
            "message": "文档上传成功"
        })
        
    except UnicodeDecodeError:
        print(f"❌ [编码错误] 文件: {file.filename}")
        raise HTTPException(status_code=400, detail="文件编码错误，请确保文件是UTF-8编码")
    except Exception as e:
        print(f"❌ [上传失败] 文件: {file.filename}, 错误: {str(e)}")
        logger.error(f"处理文件时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"处理文件时出错: {str(e)}")

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
    
    return JSONResponse({
        "success": True,
        "document_id": document_id,
        "status": doc_info.get("status", "not_started"),  # 标准模式状态
        "status_simple": doc_info.get("status_simple", "not_started"),  # 简化模式状态
        "filename": doc_info.get("filename"),
        "content": doc_info.get("content"),
        "mermaid_code": doc_info.get("mermaid_code"),  # 标准模式代码
        "mermaid_code_simple": doc_info.get("mermaid_code_simple"),  # 简化模式代码
        "error": doc_info.get("error"),  # 标准模式错误
        "error_simple": doc_info.get("error_simple")  # 简化模式错误
    })

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