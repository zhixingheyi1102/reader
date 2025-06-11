#!/usr/bin/env python3
"""
智能思维导图生成器 - Web应用启动脚本
"""

import subprocess
import sys
import os
import time
import webbrowser
from pathlib import Path

def check_requirements():
    """检查依赖是否安装"""
    try:
        import fastapi
        import uvicorn
        print("✅ FastAPI 依赖已安装")
        return True
    except ImportError:
        print("❌ 缺少 FastAPI 依赖，正在安装...")
        return False

def install_dependencies():
    """安装Python依赖"""
    try:
        subprocess.run([
            sys.executable, "-m", "pip", "install", "-r", "requirements-web.txt"
        ], check=True)
        print("✅ Python依赖安装成功")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Python依赖安装失败: {e}")
        return False

def check_node_and_npm():
    """检查Node.js和npm是否安装"""
    try:
        subprocess.run(["node", "--version"], check=True, capture_output=True)
        subprocess.run(["npm", "--version"], check=True, capture_output=True)
        print("✅ Node.js 和 npm 已安装")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ 需要安装 Node.js 和 npm")
        print("请访问 https://nodejs.org/ 下载安装 Node.js")
        return False

def setup_frontend():
    """设置前端依赖"""
    frontend_dir = Path("frontend")
    if not frontend_dir.exists():
        print("❌ frontend 目录不存在")
        return False
    
    os.chdir(frontend_dir)
    
    # 检查是否已安装依赖
    if not Path("node_modules").exists():
        print("📦 正在安装前端依赖...")
        try:
            subprocess.run(["npm", "install"], check=True)
            print("✅ 前端依赖安装成功")
        except subprocess.CalledProcessError as e:
            print(f"❌ 前端依赖安装失败: {e}")
            os.chdir("..")
            return False
    else:
        print("✅ 前端依赖已存在")
    
    os.chdir("..")
    return True

def start_backend():
    """启动后端服务"""
    print("🚀 启动后端服务...")
    backend_process = subprocess.Popen([
        sys.executable, "-m", "uvicorn", "web_backend:app", 
        "--host", "0.0.0.0", "--port", "8000", "--reload"
    ])
    
    # 等待后端启动
    time.sleep(3)
    
    return backend_process

def start_frontend():
    """启动前端服务"""
    print("🚀 启动前端服务...")
    os.chdir("frontend")
    
    frontend_process = subprocess.Popen([
        "npm", "start"
    ])
    
    os.chdir("..")
    return frontend_process

def main():
    """主函数"""
    print("=" * 60)
    print("🎯 智能思维导图生成器 - Web应用启动器")
    print("=" * 60)
    
    # 检查.env文件
    if not Path(".env").exists():
        print("⚠️  警告: 未找到 .env 文件")
        print("请确保配置了正确的 API 密钥:")
        print("- OPENAI_API_KEY (推荐使用硅基流动)")
        print("- OPENAI_BASE_URL=https://api.siliconflow.cn/v1")
        print("- API_PROVIDER=OPENAI")
        print()
    
    # 1. 检查Python依赖
    if not check_requirements():
        if not install_dependencies():
            print("❌ Python依赖安装失败，程序退出")
            return
    
    # 2. 检查Node.js
    if not check_node_and_npm():
        print("❌ 需要先安装 Node.js，程序退出")
        return
    
    # 3. 设置前端
    if not setup_frontend():
        print("❌ 前端设置失败，程序退出")
        return
    
    # 4. 启动服务
    try:
        # 启动后端
        backend_process = start_backend()
        
        # 启动前端
        frontend_process = start_frontend()
        
        # 等待前端启动
        time.sleep(5)
        
        print()
        print("=" * 60)
        print("🎉 应用启动成功！")
        print("📍 前端地址: http://localhost:3000")
        print("📍 后端API: http://localhost:8000")
        print("📍 API文档: http://localhost:8000/docs")
        print("=" * 60)
        print()
        print("💡 使用说明:")
        print("1. 访问 http://localhost:3000")
        print("2. 上传 .md 或 .txt 文件")
        print("3. 查看生成的思维导图")
        print()
        print("按 Ctrl+C 停止服务")
        
        # 自动打开浏览器
        try:
            webbrowser.open("http://localhost:3000")
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
                backend_process.terminate()
                frontend_process.terminate()
                
                backend_process.wait(timeout=5)
                frontend_process.wait(timeout=5)
            except:
                backend_process.kill()
                frontend_process.kill()
            
            print("✅ 服务已停止")
    
    except Exception as e:
        print(f"❌ 启动失败: {e}")

if __name__ == "__main__":
    main() 