import { Database } from "../lib/database.types";

export type PageTitleProps = {
  title: string;
};

type MattersTable = Database["public"]["Tables"]["matters"];
export type MatterType = MattersTable["Row"];
