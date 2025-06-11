#!/usr/bin/env python3
"""
Conda环境专用启动脚本
为在Conda环境中运行思维导图生成器Web应用而优化
"""

import subprocess
import sys
import os
import time
import tempfile
import shutil
from pathlib import Path
import threading
import webbrowser
from urllib.parse import urlparse

def print_status(message, status="INFO"):
    """打印带状态的消息"""
    colors = {
        "INFO": "\033[96m",      # 青色
        "SUCCESS": "\033[92m",   # 绿色  
        "WARNING": "\033[93m",   # 黄色
        "ERROR": "\033[91m",     # 红色
        "ENDC": "\033[0m"        # 结束颜色
    }
    print(f"{colors.get(status, '')}{status}: {message}{colors['ENDC']}")

def check_conda_env():
    """检查是否在Conda环境中"""
    conda_env = os.environ.get('CONDA_DEFAULT_ENV')
    if conda_env:
        print_status(f"检测到Conda环境: {conda_env}", "SUCCESS")
        return True
    else:
        print_status("未检测到Conda环境，但继续运行", "WARNING")
        return False

def install_requirements():
    """安装项目依赖"""
    print_status("检查并安装项目依赖...", "INFO")
    
    # 确保有requirements-web.txt文件
    if not Path("requirements-web.txt").exists():
        print_status("requirements-web.txt 不存在，创建默认依赖文件...", "WARNING")
        default_requirements = [
            "fastapi>=0.104.0",
            "uvicorn[standard]>=0.24.0",
            "python-multipart>=0.0.6",
            "aiofiles>=23.2.1",
            "aiolimiter>=1.1.0",
            "openai>=1.3.0",
            "anthropic>=0.7.7",
            "google-generativeai>=0.3.0",
            "fuzzywuzzy>=0.18.0",
            "python-Levenshtein>=0.21.1",
            "sqlmodel>=0.0.14",
            "tiktoken>=0.5.1",
            "transformers>=4.35.0",
            "numpy>=1.24.0",
            "psutil>=5.9.6",
            "spacy>=3.7.2",
            "async-timeout>=4.0.3",
            "python-decouple>=3.8",
            "aiosqlite>=0.19.0",
            "sqlalchemy>=2.0.23",
            "termcolor>=2.3.0"
        ]
        
        with open("requirements-web.txt", "w", encoding="utf-8") as f:
            f.write("\n".join(default_requirements))
        
        print_status("已创建 requirements-web.txt", "SUCCESS")
    
    try:
        # 检查关键包是否已安装
        import fastapi
        import google.generativeai
        print_status("核心依赖已安装", "SUCCESS")
    except ImportError as e:
        print_status(f"缺少关键依赖: {e}", "WARNING")
        print_status("正在安装依赖包...", "INFO")
        
        try:
            subprocess.run([
                sys.executable, "-m", "pip", "install", 
                "-r", "requirements-web.txt", 
                "--upgrade", "--no-warn-script-location"
            ], check=True, capture_output=True, text=True)
            print_status("依赖安装完成", "SUCCESS")
        except subprocess.CalledProcessError as e:
            print_status(f"依赖安装失败: {e}", "ERROR")
            print_status("尝试单独安装关键包...", "INFO")
            
            # 尝试安装关键包
            key_packages = [
                "fastapi>=0.104.0",
                "uvicorn[standard]>=0.24.0", 
                "google-generativeai>=0.3.0",
                "openai>=1.3.0",
                "python-multipart>=0.0.6"
            ]
            
            for package in key_packages:
                try:
                    subprocess.run([
                        sys.executable, "-m", "pip", "install", package, "--no-warn-script-location"
                    ], check=True, capture_output=True, text=True)
                    print_status(f"安装成功: {package}", "SUCCESS")
                except subprocess.CalledProcessError:
                    print_status(f"安装失败: {package}", "ERROR")

def check_environment_variables():
    """检查环境变量配置"""
    print_status("检查环境变量配置...", "INFO")
    
    # 检查 .env 文件
    if Path(".env").exists():
        print_status("找到 .env 文件", "SUCCESS")
        
        # 读取并检查关键配置
        try:
            with open(".env", "r", encoding="utf-8") as f:
                env_content = f.read()
                
            if "API_PROVIDER" in env_content:
                print_status("API_PROVIDER 已配置", "SUCCESS")
            else:
                print_status("API_PROVIDER 未配置，建议设置", "WARNING")
                
            if any(key in env_content for key in ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]):
                print_status("API密钥已配置", "SUCCESS")
            else:
                print_status("建议配置API密钥以获得最佳体验", "WARNING")
                
        except Exception as e:
            print_status(f"读取 .env 文件失败: {e}", "ERROR")
    else:
        print_status(".env 文件不存在，将使用默认配置", "WARNING")

def start_backend():
    """启动后端服务"""
    print_status("启动后端API服务...", "INFO")
    
    try:
        # 检查web_backend.py是否存在
        if not Path("web_backend.py").exists():
            print_status("web_backend.py 不存在!", "ERROR")
            return None
            
        print_status("后端将显示详细的处理日志，包括思维导图生成过程", "INFO")
        print_status("=" * 50, "INFO")
        
        # 启动FastAPI服务器 - 不重定向输出，保留console日志
        backend_process = subprocess.Popen([
            sys.executable, "-m", "uvicorn", 
            "web_backend:app",
            "--host", "0.0.0.0",
            "--port", "8000",
            "--reload",
            "--log-level", "info"
        ])  # 移除了stdout和stderr的重定向
        
        # 等待服务启动
        time.sleep(3)
        
        if backend_process.poll() is None:
            print_status("后端服务启动成功 (http://localhost:8000)", "SUCCESS")
            print_status("思维导图生成日志将在下方显示", "INFO")
            print_status("=" * 50, "INFO")
            return backend_process
        else:
            print_status("后端服务启动失败", "ERROR")
            return None
            
    except Exception as e:
        print_status(f"启动后端服务时出错: {e}", "ERROR")
        return None

def start_frontend():
    """启动前端服务"""
    print_status("启动前端React服务...", "INFO")
    
    frontend_dir = Path("frontend")
    if not frontend_dir.exists():
        print_status("frontend 目录不存在!", "ERROR")
        return None
    
    try:
        # 检查node_modules是否存在
        if not (frontend_dir / "node_modules").exists():
            print_status("安装前端依赖...", "INFO")
            subprocess.run(["npm", "install"], cwd=frontend_dir, check=True, capture_output=True)
            print_status("前端依赖安装完成", "SUCCESS")
        
        # 启动React开发服务器 - 只重定向前端输出以避免混乱
        frontend_process = subprocess.Popen([
            "npm", "start"
        ], cwd=frontend_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # 等待前端服务启动
        time.sleep(5)
        
        if frontend_process.poll() is None:
            print_status("前端服务启动成功 (http://localhost:3000)", "SUCCESS")
            return frontend_process
        else:
            stdout, stderr = frontend_process.communicate()
            print_status(f"前端服务启动失败", "ERROR")
            if stderr:
                print_status(f"错误信息: {stderr}", "ERROR")
            return None
            
    except subprocess.CalledProcessError as e:
        print_status(f"启动前端服务时出错: {e}", "ERROR")
        return None
    except FileNotFoundError:
        print_status("未找到 npm，请确保已安装 Node.js", "ERROR")
        return None

def open_browser():
    """延迟打开浏览器"""
    def delayed_open():
        time.sleep(8)  # 等待服务完全启动
        try:
            webbrowser.open("http://localhost:3000")
            print_status("已打开浏览器", "SUCCESS")
        except Exception as e:
            print_status(f"自动打开浏览器失败: {e}", "WARNING")
            print_status("请手动访问: http://localhost:3000", "INFO")
    
    threading.Thread(target=delayed_open, daemon=True).start()

def main():
    """主函数"""
    print_status("=== 思维导图生成器 Conda 环境启动器 ===", "INFO")
    print_status("优化的上传体验：先显示文档，再生成思维导图", "INFO")
    print_status("✨ 新功能：保留详细的控制台日志输出", "INFO")
    print("")
    
    # 检查Conda环境
    check_conda_env()
    
    # 安装依赖
    install_requirements()
    
    # 检查环境变量
    check_environment_variables()
    
    print_status("启动Web应用服务...", "INFO")
    print("")
    
    # 启动后端
    backend_process = start_backend()
    if not backend_process:
        print_status("后端启动失败，退出", "ERROR")
        return
    
    # 启动前端
    frontend_process = start_frontend()
    if not frontend_process:
        print_status("前端启动失败，但后端仍在运行", "WARNING")
        print_status("你可以访问 http://localhost:8000/docs 查看API文档", "INFO")
    else:
        # 打开浏览器
        open_browser()
    
    print("")
    print_status("=== 服务运行中 ===", "SUCCESS")
    print_status("前端地址: http://localhost:3000", "INFO")
    print_status("后端地址: http://localhost:8000", "INFO")
    print_status("API文档: http://localhost:8000/docs", "INFO")
    print("")
    print_status("📋 功能特色:", "INFO")
    print_status("  • 上传文件后立即显示文档内容", "INFO")
    print_status("  • 思维导图异步生成，实时状态更新", "INFO")
    print_status("  • 详细的控制台日志，便于调试和监控", "INFO")
    print_status("  • 支持DeepSeek、OpenAI、Claude、Gemini等多种AI模型", "INFO")
    print("")
    print_status("💡 使用提示:", "INFO")
    print_status("  • 上传.md或.txt文件后立即可以阅读内容", "INFO")
    print_status("  • 思维导图生成过程会在控制台显示详细日志", "INFO")
    print_status("  • 生成完成后可下载思维导图和Mermaid代码", "INFO")
    print("")
    print_status("按 Ctrl+C 停止服务", "WARNING")
    
    try:
        # 等待用户中断
        if frontend_process:
            frontend_process.wait()
        else:
            backend_process.wait()
    except KeyboardInterrupt:
        print_status("\n正在停止服务...", "INFO")
        
        if frontend_process:
            frontend_process.terminate()
            print_status("前端服务已停止", "SUCCESS")
            
        if backend_process:
            backend_process.terminate()
            print_status("后端服务已停止", "SUCCESS")
        
        print_status("所有服务已停止", "SUCCESS")

if __name__ == "__main__":
    main() 