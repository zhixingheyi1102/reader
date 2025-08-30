# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modern intelligent mind map generator that can automatically analyze document content and generate structured interactive mind maps. The system integrates multiple large language models and uses a front-end and back-end separation architecture to provide an excellent user experience.

### Key Features

- Multi-AI model support: DeepSeek, OpenAI GPT, Claude, Gemini and other mainstream models
- Multi-format support: Markdown (.md), text (.txt) files, extensible PDF support
- Interactive visualization: High-quality mind maps based on Mermaid.js
- Asynchronous processing: Documents displayed immediately after upload, mind maps generated asynchronously
- Modern interface: React + Tailwind CSS responsive design
- Mobile adaptation: Supports mobile device access
- Real-time synchronization: Document reading linked with mind map highlighting
- Argument structure analysis: Specialized academic document argument logic analysis
- Multiple exports: Supports Markdown, Mermaid code, HTML and other formats
- Online editing: Integrated Mermaid Live Editor

## Architecture

### Overall Architecture

The system uses a front-end/back-end separation architecture:

1. **Frontend** (React): 
   - Document upload and viewing interface
   - Interactive mind map display
   - Real-time synchronization between document and mind map
   - Drag-and-drop functionality for content reorganization

2. **Backend** (FastAPI/Python):
   - Document parsing and structuring
   - Mind map generation engine
   - AI model integration and management
   - Asynchronous task processing

3. **AI Integration**:
   - Unified interface for multiple AI providers
   - Cost control and token usage tracking
   - Intelligent retry mechanisms
   - Error recovery and graceful degradation

### Technology Stack

**Backend**:
- FastAPI: Modern asynchronous web framework
- Python 3.8+
- Multiple AI model integrations
- Document parsing based on regex

**Frontend**:
- React 18 with Hooks
- Tailwind CSS
- Mermaid.js for diagram rendering
- React Router
- Axios for API calls

## Common Development Tasks

### Running the Application

#### Quick Start (Recommended)
```bash
# Clone project
# Configure environment variables by copying .env.example to .env
# Run one-click startup script
python start_conda_web_app.py
```

#### Manual Installation
```bash
# 1. Install Python dependencies
pip install -r requirements-web.txt

# 2. Install frontend dependencies
cd frontend
npm install

# 3. Start backend service
python -m uvicorn web_backend:app --host 0.0.0.0 --port 8000 --reload

# 4. Start frontend service (new terminal)
cd frontend
npm start
```

### Building

**Frontend**:
```bash
cd frontend
npm run build
```

### Testing

**Backend tests**:
```bash
python -m pytest tests/
```

**Frontend tests**:
```bash
cd frontend
npm test
```

### Code Structure

**Backend**:
- `web_backend.py`: Main FastAPI application and routes
- `mindmap_generator.py`: Core mind map generation engine
- `document_parser.py`: Document structure parser

**Frontend**:
- `src/components/`: React components
- `src/hooks/`: Custom React hooks
- `src/utils/`: Utility functions

### Key APIs

1. **Document Upload**: POST /api/upload-document
2. **Generate Argument Structure**: POST /api/generate-argument-structure/{document_id}
3. **Get Document Status**: GET /api/document-status/{document_id}
4. **Get Document**: GET /api/document/{document_id}

### Development Notes

- All AI integrations go through a unified interface in the backend
- Frontend uses React hooks extensively for state management
- Mind maps are generated using Mermaid.js with custom formatting
- Document parsing supports hierarchical structure analysis
- Real-time synchronization between document and mind map is implemented through custom mapping

### Environment Variables

Configure in `.env` file:
- API_PROVIDER: DEEPSEEK, OPENAI, CLAUDE, or GEMINI
- Corresponding API keys for selected provider

Full API documentation available at http://localhost:8000/docs when running.