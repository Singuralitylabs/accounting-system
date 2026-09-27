import { PageTitleProps } from "../types/types";

const PageTitle: React.FC<PageTitleProps> = ({ title, description }) => {
  return (
    <div className="mb-4 border-b border-gray-200 pb-3">
      <h1 className="border-l-4 border-gray-800 pl-3 text-xl font-semibold text-gray-900 sm:text-2xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 pl-4 text-sm text-gray-600">{description}</p>
      ) : null}
    </div>
  );
};

export default PageTitle;
