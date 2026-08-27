import { Loader, Overlay } from "@mantine/core";
import { overlayBackgroundProps, overlayZIndex } from "../theme";

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

/**
 * モーダルの遅延読み込み（next/dynamic の loading）専用。
 * モーダルは呼び出し元の DOM 位置に関わらず画面中央に出るため、
 * fallback も h-64 の枠を使わず画面中央に固定する
 * （呼び出し元の位置に描画するとリストの下に出たりレイアウトシフトが起きる）。
 * 背景の暗さ・ぼかし・z-index は LoadingOverlay と同じ theme の値を使う。
 */
export const ModalLoadingFallback = () => {
  return (
    <Overlay
      fixed
      center
      {...overlayBackgroundProps}
      zIndex={overlayZIndex}
      role="status"
      aria-label="読み込み中"
    >
      <Loader />
    </Overlay>
  );
};
