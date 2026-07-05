import DatePicker, { registerLocale } from "react-datepicker";
import { ja } from "date-fns/locale/ja";
import "react-datepicker/dist/react-datepicker.css";

// 日本語ロケール登録と CSS 読み込みを済ませた DatePicker の単一入口。
// react-datepicker を直接 import せず必ずこのモジュール経由で使うことで、
// ロケール登録・CSS の読み込み漏れを構造的に防ぐ。
// NOTE: root layout で登録すると react-datepicker + date-fns が全ページの
// 共通バンドルに含まれてしまうため、layout には置かない。
registerLocale("ja", ja);

export default DatePicker;
