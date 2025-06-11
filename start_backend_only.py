#!/usr/bin/env python3
"""
智能思维导图生成器 - 仅后端启动脚本
用于测试后端API功能，不需要Node.js
"""

import subprocess
import sys
import os
import time
import webbrowser
from pathlib import Path

def check_conda_environment():
    """检查conda环境"""
    conda_env = os.environ.get('CONDA_DEFAULT_ENV')
    if conda_env:
        print(f"✅ 运行在conda环境: {conda_env}")
        return True
    else:
        print("⚠️  不在conda环境中，但继续运行")
        return True

def check_python_version():
    """检查Python版本"""
    version = sys.version_info
    print(f"🐍 Python版本: {version.major}.{version.minor}.{version.micro}")
    if version.major >= 3 and version.minor >= 8:
        print("✅ Python版本兼容")
        return True
    else:
        print("❌ Python版本应该 >= 3.8")
        return False

def check_requirements():
    """检查依赖是否安装"""
    try:
        import fastapi
        import uvicorn
        print("✅ FastAPI依赖已安装")
        return True
    except ImportError:
        print("❌ 缺少FastAPI依赖，正在安装...")
        return False

def install_dependencies():
    """安装Python依赖"""
    try:
        print("📦 安装Python依赖...")
        result = subprocess.run([
            sys.executable, "-m", "pip", "install", "-r", "requirements-web.txt"
        ], capture_output=True, text=True, encoding='utf-8')
        
        if result.returncode == 0:
            print("✅ Python依赖安装成功")
            return True
        else:
            print(f"⚠️  部分包可能需要手动安装: {result.stderr}")
            return True  # 继续运行
    except Exception as e:
        print(f"❌ 安装失败: {e}")
        return False

def start_backend():
    """启动后端服务"""
    print("🚀 启动后端服务...")
    try:
        backend_process = subprocess.Popen([
            sys.executable, "-m", "uvicorn", "web_backend:app", 
            "--host", "0.0.0.0", "--port", "8000", "--reload"
        ])
        
        # 等待后端启动
        time.sleep(3)
        return backend_process
    except Exception as e:
        print(f"❌ 启动后端失败: {e}")
        return None

def main():
    """主函数"""
    print("=" * 60)
    print("🎯 智能思维导图生成器 - 仅后端模式")
    print("=" * 60)
    
    # 检查conda环境
    check_conda_environment()
    
    # 检查Python版本
    if not check_python_version():
        print("❌ Python版本不兼容，退出")
        return
    
    # 检查.env文件
    if not Path(".env").exists():
        print("⚠️  警告: 未找到.env文件")
        print("请确保配置了正确的API密钥:")
        print("- OPENAI_API_KEY (推荐使用硅基流动)")
        print("- OPENAI_BASE_URL=https://api.siliconflow.cn/v1")
        print("- API_PROVIDER=OPENAI")
        print()
    
    # 检查Python依赖
    if not check_requirements():
        print("📦 安装缺失的依赖...")
        if not install_dependencies():
            print("❌ Python依赖安装失败，退出")
            return
    
    # 启动后端服务
    try:
        backend_process = start_backend()
        if not backend_process:
            print("❌ 启动后端失败，退出")
            return
        
        print()
        print("=" * 60)
        print("🎉 后端服务启动成功！")
        print("📍 后端API: http://localhost:8000")
        print("📍 API文档: http://localhost:8000/docs")
        print("📍 Swagger UI: http://localhost:8000/docs")
        print("📍 ReDoc: http://localhost:8000/redoc")
        print("=" * 60)
        print()
        print("💡 使用说明:")
        print("1. 访问 http://localhost:8000/docs 查看API文档")
        print("2. 使用API端点 /api/upload-markdown 上传文件")
        print("3. 使用API端点 /api/document/{id} 获取结果")
        print()
        print("📋 测试命令示例:")
        print("curl -X POST http://localhost:8000/api/upload-markdown \\")
        print("  -F 'file=@your_file.md'")
        print()
        print("🌐 Web前端需要Node.js，安装后可运行完整版本")
        print("按 Ctrl+C 停止服务")
        
        # 自动打开API文档
        try:
            webbrowser.open("http://localhost:8000/docs")
        except:
            pass
        
        # 等待用户中断
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n🛑 正在停止服务...")
            
            # 停止进程
            try:
                if backend_process:
                    backend_process.terminate()
                    backend_process.wait(timeout=5)
            except:
                if backend_process:
                    backend_process.kill()
            
            print("✅ 服务已停止")
    
    except Exception as e:
        print(f"❌ 启动失败: {e}")

if __name__ == "__main__":
    main() 