// 📄 src/components/InlineCode.tsx

import { useState, useRef, useEffect, type ReactNode, type HTMLAttributes } from 'react';

interface InlineCodeProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  node?: any;
}

export const InlineCode = ({ children, node, ...props }: InlineCodeProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isInsidePre = node?.position?.start?.column !== undefined && 
                      props.className?.includes('language-');
                      
  if (isInsidePre || props.className?.startsWith('language-')) {
    return <code {...props}>{children}</code>;
  }

  const handleCopy = (e: React.MouseEvent<HTMLElement>) => {
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const codeText = e.currentTarget.textContent || '';
    
    navigator.clipboard.writeText(codeText)
      .then(() => {
        setIsCopied(true);
        
        timeoutRef.current = setTimeout(() => {
          setIsCopied(false);
          timeoutRef.current = null;
        }, 1200);
      })
      .catch(err => {
        console.error('Failed to copy inline code:', err);
      });
  };

  return (
    <code
      {...props}
      onClick={handleCopy}
      className={`custom-inline-code ${
        isCopied 
          ? 'copied' 
          : ''
      }`}
    >
      {children}
    </code>
  );
};