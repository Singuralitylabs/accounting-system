"use client";

import { MatterInfoWithUserNameType, MatterType } from "@/app/types/types";
import { AccountingMatterDetail } from "./matterDetail/AccountingMatterDetail";
import { ReadonlyMatterDetail } from "./matterDetail/ReadonlyMatterDetail";
import { UserMatterDetail } from "./matterDetail/UserMatterDetail";

type UserMatterDetailProps = {
  variant: "user";
  matterInfo: MatterType;
  teamList: string[];
  categoryList: string[];
  itemList: string[];
  certificateList: string[];
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
  isNew: boolean;
  setIsNew: React.Dispatch<React.SetStateAction<boolean>>;
};

type AccountingMatterDetailProps = {
  variant: "accounting";
  matterInfo: MatterInfoWithUserNameType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

type ReadonlyMatterDetailProps = {
  variant: "readonly";
  matterInfo: MatterInfoWithUserNameType;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

export type MatterCardDetailProps =
  | UserMatterDetailProps
  | AccountingMatterDetailProps
  | ReadonlyMatterDetailProps;

export function MatterCardDetail(props: MatterCardDetailProps) {
  if (props.variant === "accounting") {
    return (
      <AccountingMatterDetail
        matterInfo={props.matterInfo}
        opened={props.opened}
        setOpened={props.setOpened}
      />
    );
  }
  if (props.variant === "readonly") {
    return (
      <ReadonlyMatterDetail
        matterInfo={props.matterInfo}
        opened={props.opened}
        setOpened={props.setOpened}
      />
    );
  }
  return (
    <UserMatterDetail
      matterInfo={props.matterInfo}
      teamList={props.teamList}
      categoryList={props.categoryList}
      itemList={props.itemList}
      certificateList={props.certificateList}
      opened={props.opened}
      setOpened={props.setOpened}
      isNew={props.isNew}
      setIsNew={props.setIsNew}
    />
  );
}
