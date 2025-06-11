# Conda环境使用指南

## 前言

本指南专门针对在conda环境（如MinerU）中运行思维导图生成器的用户。解决了常见的依赖问题和Google Generative AI集成问题。

## 🎯 在Conda环境中运行Web应用

### 1. 确保您已经激活了py312环境

```bash
# 激活您的conda环境
conda activate py312

# 确认Python版本
python --version
```

### 2. 使用专用的Conda启动脚本

```bash
# 使用专门为conda环境优化的启动脚本
python start_conda_web_app.py
```

## 🔧 环境配置

### 方式1: 使用Conda + Pip混合安装（推荐）

```bash
# 首先用conda安装基础包
conda install -y numpy scikit-learn requests

# 然后用pip安装Web相关包
pip install fastapi uvicorn python-multipart aiofiles

# 最后运行启动脚本
python start_conda_web_app.py
```

### 方式2: 纯Pip安装

```bash
# 直接用pip安装所有依赖
pip install -r requirements-web.txt

# 运行启动脚本
python start_conda_web_app.py
```

## 🚀 快速启动

如果您的conda环境已经配置好，只需要一条命令：

```bash
python start_conda_web_app.py
```

启动脚本会自动：
- ✅ 检测conda环境
- ✅ 检查Python版本兼容性
- ✅ 安装缺失的依赖
- ✅ 启动前后端服务
- ✅ 自动打开浏览器

## 📋 环境要求

- **Python**: 3.8+ (您的py312完全符合)
- **Node.js**: 16+ (用于React前端)
- **Conda**: 任意版本
- **操作系统**: Windows/Linux/macOS

## 🛠️ 依赖解决

如果遇到依赖冲突：

```bash
# 更新conda
conda update conda

# 更新pip
python -m pip install --upgrade pip

# 清理并重新安装
pip install --force-reinstall -r requirements-web.txt
```

## 🌐 访问地址

启动成功后访问：
- **前端**: http://localhost:3000
- **后端API**: http://localhost:8000
- **API文档**: http://localhost:8000/docs

## ⚡ 性能优化

在conda环境中的优化建议：

1. **使用conda-forge频道**:
   ```bash
   conda config --add channels conda-forge
   ```

2. **创建专用环境**（可选）:
   ```bash
   conda create -n mindmap python=3.12
   conda activate mindmap
   ```

3. **预安装科学计算包**:
   ```bash
   conda install numpy scikit-learn
   ```

## 🚨 常见问题

### Q: 提示权限错误
A: 在conda环境中使用 `--user` 标志：
```bash
pip install --user -r requirements-web.txt
```

### Q: Node.js未找到
A: 安装Node.js:
```bash
# 使用conda安装
conda install nodejs npm

# 或从官网下载: https://nodejs.org/
```

### Q: 端口被占用
A: 修改端口或结束占用进程：
```bash
# 使用不同端口
uvicorn web_backend:app --port 8001
```

现在您可以在py312 conda环境中运行：
```bash
python start_conda_web_app.py
```

## 环境设置

### 1. 激活Conda环境
```bash
conda activate MinerU
```

### 2. 安装依赖包

**重要**：确保安装正确的Google Generative AI包：

```bash
# 安装核心依赖
pip install -r requirements.txt

# 或者单独安装已修复的依赖
pip install google-generativeai>=0.3.0
pip install openai anthropic aiofiles termcolor fuzzywuzzy
```

### 3. 环境变量配置

创建 `.env` 文件：
```env
# 选择API提供商（必需）
API_PROVIDER=DEEPSEEK  # 或 OPENAI, CLAUDE, GEMINI

# DeepSeek配置（推荐）
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 其他API配置（可选）
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

## 问题解决

### Google Generative AI 错误

**错误信息**：`module 'google.generativeai' has no attribute 'Client'`

**解决方案**：
1. 确保安装了正确的包：
   ```bash
   pip uninstall google-genai  # 卸载旧包
   pip install google-generativeai>=0.3.0  # 安装正确的包
   ```

2. 重启Python环境：
   ```bash
   conda deactivate
   conda activate MinerU
   ```

### 运行测试

```bash
# 测试基本功能
python mindmap_generator.py

# 测试Web应用
python start_conda_web_app.py
```

## 推荐配置

对于在MinerU环境中使用DeepSeek的用户：

```env
API_PROVIDER=DEEPSEEK
DEEPSEEK_API_KEY=your_key_here
```

DeepSeek提供：
- 成本效益高
- 响应速度快  
- 支持中文处理
- 与MinerU环境兼容性好

## 故障排除

### 依赖冲突
```bash
# 清理pip缓存
pip cache purge

# 重新安装依赖
pip install --force-reinstall -r requirements.txt
```

### 权限问题
```bash
# 使用用户级安装
pip install --user google-generativeai>=0.3.0
```

### 网络问题
```bash
# 使用国内镜像源
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple google-generativeai>=0.3.0
```

## 验证安装

运行以下Python代码验证安装：

```python
# 验证导入
try:
    import google.generativeai as genai
    print("✅ Google Generative AI 导入成功")
except ImportError as e:
    print(f"❌ 导入失败: {e}")

# 验证其他依赖
import openai, anthropic, aiofiles
print("✅ 其他依赖导入成功")
```

## 支持的API提供商

| 提供商 | 环境变量 | 推荐程度 | 备注 |
|-------|---------|---------|------|
| DeepSeek | DEEPSEEK_API_KEY | ⭐⭐⭐⭐⭐ | 推荐，成本低，中文友好 |
| OpenAI | OPENAI_API_KEY | ⭐⭐⭐⭐ | 质量高，成本较高 |
| Claude | ANTHROPIC_API_KEY | ⭐⭐⭐⭐ | 质量优秀，成本适中 |
| Gemini | GEMINI_API_KEY | ⭐⭐⭐ | 免费额度，需要正确配置 | 