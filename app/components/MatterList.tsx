"use client";

import { MatterType } from "../types/types";
import type { MatterWithProfileType } from "../hooks/useMatterData";
import { UserMatterList } from "./matterList/UserMatterList";
import { AccountingMatterList } from "./matterList/AccountingMatterList";
import {
  ReadonlyMatterList,
  TeamMatterType,
} from "./matterList/ReadonlyMatterList";

export type { TeamMatterType };

type UserMatterListProps = {
  variant: "user";
  initialData?: MatterType[];
};

type AccountingMatterListProps = {
  variant: "accounting";
  initialData?: MatterWithProfileType[];
};

type ReadonlyMatterListProps = {
  variant: "readonly";
  matterList: TeamMatterType[];
};

export type MatterListProps =
  | UserMatterListProps
  | AccountingMatterListProps
  | ReadonlyMatterListProps;

export function MatterList(props: MatterListProps) {
  if (props.variant === "accounting") {
    return <AccountingMatterList initialData={props.initialData} />;
  }
  if (props.variant === "readonly") {
    return <ReadonlyMatterList matterList={props.matterList} />;
  }
  return <UserMatterList initialData={props.initialData} />;
}
