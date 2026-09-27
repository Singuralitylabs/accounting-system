import { PageTitleProps } from "../types/types";

type Props = PageTitleProps & {
  // タイトル位置合わせ用のレイアウトクラス（各ページのコンテンツ幅に合わせる。
  // 幅の定義を呼び出し側に集約し、PageTitle 側に重複させない）
  className?: string;
};

const PageTitle: React.FC<Props> = ({ title, className }) => {
  return (
    <div className={className}>
      <div className="mb-4 border-b border-gray-200 pb-3">
        <h1 className="border-l-4 border-gray-800 pl-3 text-xl font-semibold text-gray-900 sm:text-2xl">
          {title}
        </h1>
      </div>
    </div>
  );
};

export default PageTitle;
