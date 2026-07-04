import { registerLocale } from "react-datepicker";
import { ja } from "date-fns/locale/ja";

// react-datepicker の日本語ロケールをモジュール読み込み時に一度だけ登録する。
// root layout で登録すると react-datepicker + date-fns が全ページの
// 共通バンドルに含まれてしまうため、ピッカーを使うコンポーネント側から
// side-effect import して、実際に使うページだけに読み込みを限定する。
registerLocale("ja", ja);
