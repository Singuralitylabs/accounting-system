import { Loader } from "@mantine/core";

type CompactLoaderProps = {
  color?: string;
};

export const CompactLoader = ({ color }: CompactLoaderProps) => {
  return (
    <div
      className="flex items-center justify-center"
      role="status"
      aria-label="読み込み中"
    >
      <Loader size="sm" color={color} />
    </div>
  );
};

export const LoadingSpinner = () => {
  return (
    <div
      className="flex h-64 items-center justify-center"
      role="status"
      aria-label="読み込み中"
    >
      <Loader />
    </div>
  );
};
