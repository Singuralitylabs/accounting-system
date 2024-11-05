import { Database } from "../lib/database.types";

export type PageTitleProps = {
  title: string;
};

type MattersTable = Database["public"]["Tables"]["matters"];
export type MatterType = MattersTable["Row"];

type CostsTable = Database["public"]["Tables"]["costs"];
export type CostType = CostsTable["Row"];

type ProfilesTable = Database["public"]["Tables"]["profiles"];
export type ProfilesType = ProfilesTable["Row"];

type BusinessTable = Database["public"]["Tables"]["business"];
export type BusinessType = BusinessTable["Row"];

export type SlackNotificationResponse = {
  success?: boolean;
  error?: string;
};

export type SlackNotificationMetadata = {
  matterId?: number;
  matterTitle?: string;
  sender?: string;
};

export type MatterInfoWithUserNameType = {
  user_name: string | null;
  slack_id: string | null;
} & MatterType;
