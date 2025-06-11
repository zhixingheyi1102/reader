# 🧠 智能思维导图生成器

基于AI的智能思维导图生成器，支持多种大语言模型，能够从文档内容自动生成结构化的思维导图。

## ✨ 特性

- 🤖 **多AI模型支持**: 支持 DeepSeek、OpenAI GPT-4、Claude、Gemini 等主流大语言模型
- 📄 **文档格式支持**: 支持 Markdown (.md) 和文本 (.txt) 文件
- 🎨 **美观的思维导图**: 使用 Mermaid.js 生成高质量的思维导图
- 🔄 **异步处理**: 上传文档后立即显示内容，思维导图异步生成
- 💻 **现代化UI**: 基于 React 和 Tailwind CSS 的响应式界面
- 📱 **移动端适配**: 支持移动设备访问
- ⬆️ **多种导出**: 支持下载 Markdown 文档和 Mermaid 代码
- 🔗 **在线编辑**: 集成 Mermaid Live Editor，支持在线编辑思维导图

## 🚀 快速开始

### 环境要求

- Python 3.8+
- Node.js 16+
- Conda (推荐)

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/your-username/mindmap-generator.git
   cd mindmap-generator
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，添加你的 API 密钥
   ```

3. **使用 Conda 启动** (推荐)
   ```bash
   python start_conda_web_app.py
   ```

   或者手动安装：

4. **安装后端依赖**
   ```bash
   pip install -r requirements-web.txt
   ```

5. **安装前端依赖**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

6. **启动应用**
   ```bash
   # 启动后端
   python web_backend.py
   
   # 启动前端 (新终端)
   cd frontend
   npm start
   ```

7. **访问应用**
   - 前端界面: http://localhost:3000
   - 后端API: http://localhost:8000
   - API文档: http://localhost:8000/docs

## 🔧 配置说明

### API密钥配置

在 `.env` 文件中配置你的API密钥：

```env
# 选择API提供商 (DEEPSEEK, OPENAI, CLAUDE, GEMINI)
API_PROVIDER=DEEPSEEK

# DeepSeek API
DEEPSEEK_API_KEY=your_deepseek_api_key

# OpenAI API
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1

# Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key

# Gemini API
GEMINI_API_KEY=your_gemini_api_key
```

### 支持的模型

| 提供商 | 模型 | 特点 |
|--------|------|------|
| DeepSeek | deepseek-chat | 成本低廉，中文支持好 |
| OpenAI | gpt-4o-mini | 高质量输出 |
| Claude | claude-3-5-haiku | 快速响应 |
| Gemini | gemini-2.0-flash-lite | Google 最新模型 |

## 📖 使用说明

1. **上传文档**: 在首页拖拽或选择 .md/.txt 文件
2. **查看内容**: 上传后立即显示文档内容
3. **生成思维导图**: 系统自动开始生成思维导图
4. **查看结果**: 右侧面板显示生成的思维导图
5. **导出分享**: 下载文档或在线编辑思维导图

## 🛠️ 技术栈

### 后端
- **FastAPI**: 现代Python Web框架
- **Python**: 核心语言
- **异步处理**: 支持并发请求处理

### 前端
- **React 18**: 现代前端框架
- **Tailwind CSS**: 原子化CSS框架
- **Mermaid.js**: 思维导图渲染
- **React Router**: 路由管理
- **Axios**: HTTP客户端

### AI集成
- **多模型支持**: 统一的AI接口抽象
- **异步生成**: 非阻塞的思维导图生成
- **错误恢复**: 完善的错误处理机制

## 📁 项目结构

```
mindmap-generator/
├── README.md                 # 项目说明
├── requirements-web.txt      # Python依赖
├── .env.example             # 环境变量模板
├── .gitignore               # Git忽略文件
├── start_conda_web_app.py   # Conda环境启动脚本
├── web_backend.py           # FastAPI后端服务
├── mindmap_generator.py     # 思维导图生成核心
├── frontend/                # React前端
│   ├── package.json         # Node.js依赖
│   ├── src/                 # 源代码
│   │   ├── components/      # React组件
│   │   │   ├── UploadPage.js      # 上传页面
│   │   │   ├── ViewerPage.js      # 查看页面
│   │   │   └── MermaidDiagram.js  # 思维导图组件
│   │   └── App.js           # 主应用
│   └── public/              # 静态文件
└── uploads/                 # 上传文件存储
```

## 🔍 API文档

### 上传文档
```http
POST /api/upload-document
Content-Type: multipart/form-data

{
  "file": "document.md"
}
```

### 生成思维导图
```http
POST /api/generate-mindmap/{document_id}
```

### 查询状态
```http
GET /api/document-status/{document_id}
```

更多API详情请访问: http://localhost:8000/docs

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支: `git checkout -b feature/amazing-feature`
3. 提交更改: `git commit -m 'Add amazing feature'`
4. 推送分支: `git push origin feature/amazing-feature`
5. 提交 Pull Request

## 📝 许可证

本项目基于 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Mermaid.js](https://mermaid.js.org/) - 思维导图渲染
- [FastAPI](https://fastapi.tiangolo.com/) - 后端框架
- [React](https://react.dev/) - 前端框架
- [Tailwind CSS](https://tailwindcss.com/) - 样式框架

## 📞 支持

如有问题，请提交 [Issue](https://github.com/your-username/mindmap-generator/issues) 或联系作者。

---

⭐ 如果这个项目对你有帮助，请给它一个星标！
