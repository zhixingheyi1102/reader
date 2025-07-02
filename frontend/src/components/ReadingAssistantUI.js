import React, { useRef, useEffect } from 'react';
import { Bot, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';

const ReadingAssistantUI = ({ questions, currentQuestions, questionHistory, status, onRetry }) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [questionHistory, currentQuestions]);

  const getStatusIcon = () => {
    switch (status) {
      case 'generating':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'generating':
        return '正在分析文档并生成问题...';
      case 'completed':
        return `已生成${questions.length}个阅读辅助问题`;
      case 'error':
        return '生成问题失败';
      default:
        return '准备生成阅读问题';
    }
  };

  if (status === 'not_started' || status === 'generating') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-4">
          <div className="mb-3">
            {getStatusIcon()}
          </div>
          <p className="text-sm text-gray-600 mb-2">{getStatusText()}</p>
          {status === 'generating' && (
            <p className="text-xs text-gray-500">
              AI正在分析每个段落的内容...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-4">
          <div className="mb-3">
            {getStatusIcon()}
          </div>
          <p className="text-sm text-red-600 mb-3">{getStatusText()}</p>
          <button
            onClick={onRetry}
            className="inline-flex items-center px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            重试生成
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 欢迎消息 */}
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0">
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
              <Bot className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 max-w-xs">
              <p className="text-xs text-blue-800">
                你好！我是AI阅读助手。我会在你阅读时提出一些问题来帮助你更好地理解文档内容。
              </p>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              刚刚
            </div>
          </div>
        </div>

        {/* 状态信息 */}
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0">
            <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-w-xs">
              <p className="text-xs text-green-800">
                已为你生成了{questions.length}个阅读问题。当你滚动到相关段落时，我会适时提出问题。
              </p>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              刚刚
            </div>
          </div>
        </div>

        {/* 历史问题 */}
        {questionHistory.map((question, index) => (
          <div key={question.id || index} className="flex items-start space-x-2">
            <div className="flex-shrink-0">
              <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                <Bot className="w-3 h-3 text-white" />
              </div>
            </div>
            <div className="flex-1">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 max-w-xs">
                <div className="text-xs text-purple-900 font-medium mb-1">
                  {question.type || '思考'}问题
                </div>
                <p className="text-xs text-purple-800">
                  {question.question}
                </p>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                第{question.paragraph_index + 1}段
              </div>
            </div>
          </div>
        ))}

        {/* 当前问题 */}
        {currentQuestions.map((question, index) => (
          <div key={`current-${index}`} className="flex items-start space-x-2 animate-fade-in">
            <div className="flex-shrink-0">
              <div className="w-6 h-6 bg-orange-600 rounded-full flex items-center justify-center animate-pulse">
                <Bot className="w-3 h-3 text-white" />
              </div>
            </div>
            <div className="flex-1">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 max-w-xs shadow-sm">
                <div className="text-xs text-orange-900 font-medium mb-1">
                  💡 {question.type || '思考'}问题
                </div>
                <p className="text-xs text-orange-800 font-medium">
                  {question.question}
                </p>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                正在阅读第{question.paragraph_index + 1}段
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* 底部状态栏 */}
      <div className="border-t bg-gray-100 px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>
            阅读进度：已显示 {questionHistory.length} / {questions.length} 个问题
          </span>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>正在监测阅读进度</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadingAssistantUI; 