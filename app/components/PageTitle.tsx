import { PageTitleProps } from "../types/types";

const PageTitle: React.FC<PageTitleProps> = ({ title }) => {
  return (
    <div>
      <div className="text-3xl justify-center py-4 flex">{title}</div>
    </div>
  );
};

export default PageTitle;
