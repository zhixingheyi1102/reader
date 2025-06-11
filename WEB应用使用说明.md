# 智能思维导图生成器 - Web应用版

## 🎯 项目概述

基于您现有的思维导图生成器项目，我已经为您创建了一个完整的Web应用。该应用包含：

- **React前端**: 现代化的用户界面，支持文件上传和可视化
- **FastAPI后端**: 高性能的Python API服务
- **响应式布局**: 左侧MD阅读器(2/3) + 右侧思维导图(1/3)
- **智能AI分析**: 基于您现有的LLM驱动的内容分析引擎

## 🏗️ 项目结构

```
📁 您的项目根目录/
├── 📄 mindmap_generator.py      # 原有的核心生成器
├── 📄 web_backend.py            # FastAPI后端服务
├── 📄 start_web_app.py          # 一键启动脚本
├── 📄 requirements-web.txt      # Web版Python依赖
├── 📄 .env                      # API配置（需要您配置）
├── 📁 frontend/                 # React前端应用
│   ├── 📄 package.json         # 前端依赖配置
│   ├── 📄 tailwind.config.js   # 样式配置
│   ├── 📁 src/
│   │   ├── 📄 App.js           # 主应用组件
│   │   ├── 📄 App.css          # 主样式文件
│   │   └── 📁 components/
│   │       ├── 📄 UploadPage.js    # 文件上传页面
│   │       ├── 📄 ViewerPage.js    # 文档查看页面
│   │       └── 📄 MermaidDiagram.js # 思维导图组件
│   └── 📁 public/
│       └── 📄 index.html       # HTML模板
└── 📁 uploads/                  # 上传文件存储目录
```

## 🚀 快速开始

### 方式一：一键启动（推荐）

```bash
# 直接运行启动脚本
python start_web_app.py
```

启动脚本会自动：
- ✅ 检查并安装Python依赖
- ✅ 检查Node.js环境
- ✅ 安装前端依赖
- ✅ 启动后端和前端服务
- ✅ 自动打开浏览器

### 方式二：手动启动

```bash
# 1. 安装Python依赖
pip install -r requirements-web.txt

# 2. 进入前端目录并安装依赖
cd frontend
npm install

# 3. 启动后端（新终端）
python -m uvicorn web_backend:app --host 0.0.0.0 --port 8000 --reload

# 4. 启动前端（新终端）
cd frontend
npm start
```

## 🔧 环境配置

确保您的 `.env` 文件包含正确的API配置：

```env
# 推荐配置：硅基流动
OPENAI_API_KEY="您的硅基流动API密钥"
OPENAI_BASE_URL="https://api.siliconflow.cn/v1"
API_PROVIDER="OPENAI"

# 其他API（可选）
DEEPSEEK_API_KEY=""
ANTHROPIC_API_KEY=""
GEMINI_API_KEY=""
```

## 🌐 访问地址

启动成功后，您可以访问：

- **前端应用**: http://localhost:3000
- **后端API**: http://localhost:8000
- **API文档**: http://localhost:8000/docs

## 📱 功能特性

### 🎨 用户界面

1. **上传页面**
   - 支持拖拽上传 `.md` 和 `.txt` 文件
   - 文件大小限制：10MB
   - 实时上传进度显示
   - 优雅的错误处理

2. **查看页面**
   - **左侧 (2/3宽度)**: Markdown阅读器
     - 语法高亮
     - 响应式排版
     - 自定义样式优化
   - **右侧 (1/3宽度)**: Mermaid思维导图
     - 实时渲染
     - 交互式图表
     - 代码复制功能

### 🔧 工具功能

- **下载功能**: 
  - 下载原始Markdown文件
  - 下载Mermaid图表代码
- **在线编辑**: 直接跳转到Mermaid Live Editor
- **响应式设计**: 适配各种屏幕尺寸

## 🎯 使用流程

### 1. 访问应用
打开浏览器访问 `http://localhost:3000`

### 2. 上传文件
- 拖拽文件到上传区域，或点击选择文件
- 支持的格式：`.md`、`.txt`
- 系统会自动验证文件类型和大小

### 3. 查看结果
- 上传成功后自动跳转到查看页面
- 左侧阅读Markdown内容
- 右侧查看AI生成的思维导图

### 4. 导出和分享
- 使用工具栏下载文件或图表代码
- 点击"编辑图表"在线编辑Mermaid代码

## 🔍 技术架构

### 前端技术栈
- **React 18**: 现代化React框架
- **React Router**: 单页应用路由
- **Tailwind CSS**: 实用优先的CSS框架
- **Mermaid**: 图表渲染引擎
- **React Markdown**: Markdown渲染组件
- **React Dropzone**: 文件拖拽上传
- **Axios**: HTTP客户端
- **React Hot Toast**: 消息提示

### 后端技术栈
- **FastAPI**: 高性能异步Web框架
- **Uvicorn**: ASGI服务器
- **您的现有引擎**: 
  - MindMapGenerator
  - 多API提供商支持
  - 智能内容分析

## 🛠️ 开发和自定义

### 修改样式
编辑 `frontend/src/App.css` 或使用Tailwind工具类

### 添加新功能
- 前端：在 `frontend/src/components/` 添加新组件
- 后端：在 `web_backend.py` 添加新API端点

### 配置调整
- 修改 `frontend/package.json` 调整前端配置
- 修改 `web_backend.py` 调整API配置

## 🔒 安全考虑

- **文件验证**: 严格的文件类型和大小检查
- **API安全**: CORS配置和请求验证
- **错误处理**: 优雅的错误边界和用户反馈
- **数据清理**: 自动清理临时文件

## 🚨 故障排除

### 常见问题

1. **端口占用**
   ```bash
   # 更改端口
   uvicorn web_backend:app --port 8001
   ```

2. **API密钥问题**
   - 检查 `.env` 文件配置
   - 确保API密钥有效且有足够余额

3. **依赖安装失败**
   ```bash
   # 清理并重新安装
   pip install --force-reinstall -r requirements-web.txt
   ```

4. **前端构建失败**
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   ```

### 日志查看

- **后端日志**: 在运行uvicorn的终端查看
- **前端日志**: 在浏览器开发者工具的Console查看

## 📞 支持和反馈

如果您遇到任何问题或有改进建议，请：

1. 检查上述故障排除指南
2. 查看控制台日志
3. 确认API配置是否正确
4. 验证网络连接是否正常

## 🎉 总结

这个Web应用完美结合了您现有的AI思维导图生成能力和现代化的Web界面。用户可以：

- 📤 **轻松上传**文档
- 👀 **并排查看**原文和思维导图  
- 💾 **便捷导出**结果
- 🎨 **享受现代化**的用户体验

现在您可以运行 `python start_web_app.py` 来启动这个完整的Web应用了！ 