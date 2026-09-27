import { PageTitleProps } from "../types/types";

const PageTitle: React.FC<PageTitleProps> = ({ title, className }) => {
  return (
    <div className={className}>
      <h1 className="mb-4 border-b border-gray-200 pb-3 border-l-4 border-l-gray-800 pl-3 text-xl font-semibold text-gray-900 sm:text-2xl">
        {title}
      </h1>
    </div>
  );
};

export default PageTitle;
