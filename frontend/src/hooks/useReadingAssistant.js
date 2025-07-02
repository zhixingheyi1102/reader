import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export const useReadingAssistant = (documentId, document) => {
  // AI辅助阅读相关状态
  const [readingQuestionsStatus, setReadingQuestionsStatus] = useState('not_started');
  const [readingQuestions, setReadingQuestions] = useState([]);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [showReadingAssistant, setShowReadingAssistant] = useState(true);
  const [questionHistory, setQuestionHistory] = useState([]);
  const [hasShownQuestions, setHasShownQuestions] = useState(new Set());

  const generateReadingQuestions = async () => {
    try {
      setReadingQuestionsStatus('generating');
      toast.success('开始生成AI阅读辅助问题...');
      
      // 获取实际的文档ID（去掉demo-前缀）
      const actualDocumentId = documentId.startsWith('demo-') 
        ? documentId.replace('demo-', '') 
        : documentId;
      
      const response = await axios.post(`http://localhost:8000/api/generate-reading-questions/${actualDocumentId}`);
      
      if (response.data.success) {
        setReadingQuestions(response.data.questions || []);
        setReadingQuestionsStatus('completed');
        toast.success(`生成了${response.data.total_questions}个阅读辅助问题！`);
      } else {
        throw new Error(response.data.error || '生成问题失败');
      }
    } catch (error) {
      console.error('Generate reading questions error:', error);
      setReadingQuestionsStatus('error');
      toast.error('生成阅读辅助问题失败');
    }
  };

  const loadReadingQuestions = async () => {
    try {
      // 获取实际的文档ID（去掉demo-前缀）
      const actualDocumentId = documentId.startsWith('demo-') 
        ? documentId.replace('demo-', '') 
        : documentId;
        
      const response = await axios.get(`http://localhost:8000/api/reading-questions/${actualDocumentId}`);
      
      if (response.data.success) {
        const questions = response.data.questions || [];
        setReadingQuestions(questions);
        setReadingQuestionsStatus('completed');
        console.log('📚 [AI问题] 加载了', questions.length, '个问题:', questions);
      }
    } catch (error) {
      console.error('Load reading questions error:', error);
    }
  };

  const checkForNewQuestions = (activeChunkId) => {
    console.log('🔍 [AI问题检查] 开始检查问题，活动章节:', activeChunkId);
    console.log('🔍 [AI问题检查] 总问题数:', readingQuestions.length);
    console.log('🔍 [AI问题检查] 已显示问题:', Array.from(hasShownQuestions));
    console.log('🔍 [AI问题检查] 阅读助手状态:', showReadingAssistant);
    
    if (readingQuestions.length === 0 || !activeChunkId) {
      console.log('🔍 [AI问题检查] 跳过：没有问题或没有活动章节');
      return;
    }
    
    // 打印所有问题的chunk_id用于调试
    console.log('🔍 [AI问题检查] 所有问题的chunk_id:', readingQuestions.map(q => q.chunk_id));
    
    // 找到当前活动章节对应的问题
    const questionsToShow = readingQuestions.filter(q => {
      const matches = q.chunk_id === activeChunkId && !hasShownQuestions.has(q.chunk_id);
      console.log(`🔍 [AI问题检查] 问题 "${q.question}" chunk_id: ${q.chunk_id}, 匹配: ${matches}`);
      return matches;
    });
    
    console.log('🔍 [AI问题检查] 找到', questionsToShow.length, '个待显示问题');
    
    if (questionsToShow.length > 0) {
      // 只显示第一个新问题，避免一次性显示太多
      const questionToShow = questionsToShow[0];
      
      // 添加到问题历史
      setQuestionHistory(prev => [...prev, {
        ...questionToShow,
        timestamp: new Date().toISOString(),
        id: `${questionToShow.chunk_id}_${Date.now()}`
      }]);
      
      // 标记已显示
      setHasShownQuestions(prev => new Set([...prev, questionToShow.chunk_id]));
      
      // 显示当前问题
      setCurrentQuestions([questionToShow]);
      
      // 5秒后隐藏当前问题
      setTimeout(() => {
        setCurrentQuestions([]);
      }, 5000);
      
      console.log('💡 [AI问题] 显示问题:', questionToShow.question, '章节:', activeChunkId);
    } else {
      console.log('🔍 [AI问题检查] 没有找到新问题可显示');
    }
  };

  // 文档加载完成后自动开始生成AI阅读问题
  useEffect(() => {
    if (document && readingQuestionsStatus === 'not_started') {
      // 演示模式禁用AI助手
      if (documentId.startsWith('demo-')) {
        setReadingQuestionsStatus('disabled');
        return;
      }
      
      setTimeout(() => {
        generateReadingQuestions();
      }, 2000); // 延迟2秒，让思维导图先开始
    }
  }, [document, readingQuestionsStatus, documentId]);

  return {
    readingQuestionsStatus,
    readingQuestions,
    currentQuestions,
    showReadingAssistant,
    setShowReadingAssistant,
    questionHistory,
    hasShownQuestions,
    generateReadingQuestions,
    loadReadingQuestions,
    checkForNewQuestions
  };
}; 