import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './contexts/ThemeContext';
import ThemeToggle from './components/ThemeToggle';
import UploadPage from './components/UploadPage';
import ViewerPageRefactored from './components/ViewerPageRefactored';
import './App.css';

function AppContent() {
  const location = useLocation();
  const isViewerPage = location.pathname.startsWith('/viewer/');

  return (
    <div className={isViewerPage ? "h-full bg-gray-50 dark:bg-gray-900" : "min-h-screen bg-gray-50 dark:bg-gray-900"}>
      {!isViewerPage && (
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
              <svg className="w-8 h-8 mr-3 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              智能思维导图生成器
            </h1>
            <ThemeToggle />
          </div>
        </header>
      )}

      <main className={isViewerPage ? "h-full" : "max-w-7xl mx-auto"}>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/viewer/:documentId" element={<ViewerPageRefactored />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <div className="App h-full">
        <Router>
          <AppContent />
        </Router>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--toast-bg)',
              color: 'var(--toast-color)',
            },
            className: 'dark:bg-gray-800 dark:text-white bg-gray-800 text-white',
          }}
        />
      </div>
    </ThemeProvider>
  );
}

export default App; 