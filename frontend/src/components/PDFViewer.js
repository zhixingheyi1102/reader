import React from 'react';
import { File } from 'lucide-react';

const PDFViewer = ({ pdfBase64 }) => {
  if (!pdfBase64) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center">
          <File className="h-12 w-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">PDF文件不可用</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white">
      <embed
        src={`data:application/pdf;base64,${pdfBase64}`}
        type="application/pdf"
        width="100%"
        height="100%"
        className="border-0 rounded-none block"
        style={{ 
          minHeight: '100%',
          margin: 0,
          padding: 0,
          display: 'block'
        }}
      />
    </div>
  );
};

export default PDFViewer; 