import React from 'react';

interface ResponsiveCardTableWrapperProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const ResponsiveCardTableWrapper: React.FC<ResponsiveCardTableWrapperProps> = ({
  title,
  description,
  children,
  className = ''
}) => {
  return (
    <div className={`bg-white rounded-lg shadow-md border border-gray-200 ${className}`}>
      {/* Card Header - Always visible and responsive */}
      {(title || description) && (
        <div className="p-4 border-b border-gray-200">
          {title && (
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-gray-600">
              {description}
            </p>
          )}
        </div>
      )}
      
      {/* Scrollable Table Container */}
      <div className="w-full">
        {/* 
          Key CSS classes for table-only scrolling:
          - w-full: Full width of the card
          - overflow-x-auto: Horizontal scroll when needed
          - max-w-full: Prevents the container from expanding beyond card width
        */}
        <div className="w-full overflow-x-auto max-w-full">
          {/* 
            Inner container to ensure proper scrolling behavior
            - min-w-full: Ensures table takes full width when content is small
            - The table inside should have min-w-max or specific min-width
          */}
          <div className="min-w-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResponsiveCardTableWrapper;