import React from 'react';
import { GripVertical } from 'lucide-react';

const LogicalDivider = ({ nodeInfo }) => {
  const { title, id, color = 'gray' } = nodeInfo;
  
  // 根据颜色获取对应的Tailwind类
  const getColorClasses = (color) => {
    const colorMap = {
      gray: 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
      blue: 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-700 text-blue-600 dark:text-blue-400',
      green: 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-700 text-green-600 dark:text-green-400',
      purple: 'border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-700 text-purple-600 dark:text-purple-400',
      red: 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-700 text-red-600 dark:text-red-400',
      yellow: 'border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-700 text-yellow-600 dark:text-yellow-400'
    };
    return colorMap[color] || colorMap.gray;
  };

  return (
    <div className="relative my-6 group">
      {/* 水平分割线 */}
      <div className={`border-t-2 ${getColorClasses(color).split(' ')[0]} ${getColorClasses(color).split(' ')[1]}`} />
      
      {/* 拖拽手柄和标签容器 */}
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center">
        {/* 拖拽手柄 */}
        <div className={`
          flex items-center justify-center w-6 h-6 rounded-full border-2 
          ${getColorClasses(color)}
          opacity-0 group-hover:opacity-100 transition-opacity duration-200
          cursor-grab hover:cursor-grabbing
          shadow-sm
        `}>
          <GripVertical className="w-3 h-3" />
        </div>
        
        {/* 节点标签 */}
        <div className={`
          ml-2 px-3 py-1 rounded-full text-xs font-medium
          ${getColorClasses(color)}
          border-2 shadow-sm
          max-w-xs truncate
        `}>
          {title}
        </div>
      </div>
    </div>
  );
};

export default LogicalDivider; 