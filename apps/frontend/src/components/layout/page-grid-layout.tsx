import { PropsWithChildren } from 'react';

export const PageGrid: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <div className={'grid md:grid-cols-3 grid-cols-1 gap-4'}>{children}</div>
  );
};

export const MainContent: React.FC<PropsWithChildren> = ({ children }) => {
  // `min-w-0` lets this grid column shrink below its content's intrinsic width,
  // so a wide child (e.g. a table with many/optional columns) scrolls inside its
  // own `overflow-x-auto` container instead of pushing its last column off the
  // edge / under the aside.
  return <div className={'md:col-span-2 min-w-0'}>{children}</div>;
};

export const PageAside: React.FC<PropsWithChildren> = ({ children }) => {
  return <div className={'col-span-1'}>{children}</div>;
};

// Re-export with old names for backward compatibility during migration
/** @deprecated Use PageGrid instead */
export const Page = PageGrid;
/** @deprecated Use PageAside instead */
export const Sidebar = PageAside;
