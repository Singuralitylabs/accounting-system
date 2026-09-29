"use client";

import {
  Alert,
  Button,
  Group,
  LoadingOverlay,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { ProfilesType } from "../types/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkUpdateProfiles } from "../utils/supabase/profiles";
import { notifyError, notifySuccess } from "../utils/notify";
import { confirmAction } from "../utils/confirmAction";
import {
  formatUserValidationErrors,
  selectChangedUsers,
  UserValidationErrors,
  validateUserUpdates,
} from "../utils/userList";
import { sortUserList } from "../utils/userListSort";
import { useViewportSize } from "@mantine/hooks";
import { useReportDashboardUnsavedChanges } from "./dashboard/DashboardUnsavedChanges";
import UserCard from "./UserCard";
import UserTable from "./UserTable";

// ID は管理者の操作で使わないため表示しない（React の key には引き続き id を使う）
const elementListOfUser = [
  "名前",
  "メールアドレス",
  "権限",
  "チーム",
  "slack ID",
];

// チーム欄の選択肢。Select は value が data に無いと空表示になるため、
// 選択肢に無い現在値（無効化・名前変更されたチーム、選択肢の取得失敗時）も先頭に補い、
// 管理者が現在の所属を確認できるようにする。
export const teamOptionsFor = (team: string | null, teamList: string[]) =>
  team && !teamList.includes(team) ? [team, ...teamList] : teamList;

type Props = {
  userList: ProfilesType[];
  // チームの選択肢。サーバ側（DynamicDashboardUsers）で取得済みのものを受け取る。
  // 行ごとにクライアントから取得すると、行数分の Server Action が直列に走り
  // チーム欄だけ表示が遅れるため（Select は value が data に無いと空表示になる）。
  teamList: string[];
  // チームの選択肢の取得に失敗したか（チーム欄の選択肢が現在値のみになる旨を表示する）
  teamListError?: boolean;
};

const toRowMap = (users: ProfilesType[]) =>
  new Map(users.map((user) => [user.id, user]));

const UserList = ({ userList, teamList, teamListError = false }: Props) => {
  const router = useRouter();
  // 表示順は権限 → チーム → 名前（sortUserList）。並べ替えるのは読み込み時と保存成功後
  // だけで、編集中は並べ替えない（権限やチームを変えた行がその場から動くと見失うため）
  const [rows, setRows] = useState<ProfilesType[]>(() =>
    sortUserList(userList, teamList),
  );
  // 画面に読み込んだ時点（または直前の保存成功時点）の行。これと比べて変更した行を
  // ハイライトし、保存時は変更した行だけを送る（ExtraEntryList と同じ方式）
  const [baseline, setBaseline] = useState(() => toRowMap(userList));
  const [isSaving, setIsSaving] = useState(false);
  // 保存を試みて入力エラーがあったか。以降は入力のたびにエラー表示を更新する
  const [showErrors, setShowErrors] = useState(false);

  const { width } = useViewportSize();
  const isMobile = width < 768;

  const changedRows = useMemo(
    () => selectChangedUsers(rows, baseline),
    [rows, baseline],
  );
  const changedIds = useMemo(
    () => new Set(changedRows.map((row) => row.id)),
    [changedRows],
  );
  const hasChanges = changedRows.length > 0;
  const validationErrors = useMemo(
    () => validateUserUpdates(changedRows),
    [changedRows],
  );
  const visibleErrors = showErrors
    ? validationErrors
    : new Map<number, UserValidationErrors>();

  // 保存後の再取得（router.refresh）などでサーバの一覧が変わったら、未保存の変更が
  // 無い場合に限り表示を同期する（編集中の内容は黙って破棄しない）。
  // 編集中に届いた最新の一覧は、変更が無くなった時点（「変更を破棄」・値を元に戻した・
  // 保存に成功した）で同期する。同期済みの一覧を ref で覚え、届いていた最新値を取りこぼして
  // 古い baseline のまま次の保存で他の管理者の値を上書きしないようにする
  const syncedUserListRef = useRef(userList);
  const syncedTeamListRef = useRef(teamList);
  // 最新の props（保存成功時に「同期済み」として扱うため）
  const latestPropsRef = useRef({ userList, teamList });
  latestPropsRef.current = { userList, teamList };
  useEffect(() => {
    if (hasChanges) return;
    if (
      userList === syncedUserListRef.current &&
      teamList === syncedTeamListRef.current
    ) {
      return;
    }
    syncedUserListRef.current = userList;
    syncedTeamListRef.current = teamList;
    setRows(sortUserList(userList, teamList));
    setBaseline(toRowMap(userList));
  }, [userList, teamList, hasChanges]);

  // 管理画面の Provider（DashboardUnsavedChangesProvider）に未保存の変更の有無を知らせる。
  // メニュー（DashboardNav）からの切り替え前の確認と、リロード・タブを閉じる操作の警告
  // （beforeunload。Provider がまとめて登録する）に使う
  useReportDashboardUnsavedChanges(hasChanges);

  const handleUpdateUserList = (
    userId: number,
    updates: Partial<ProfilesType>,
  ) => {
    // 権限を読み込み時点（直前の保存成功時点）の値に戻したら、チームも戻す（権限を
    // 変えて戻しただけでチームが消えたまま「変更あり」・入力エラーにならないように）。
    // それ以外で teamleader 以外に変更したらチームを空にする（PC・モバイル共通）
    const saved = baseline.get(userId);
    const normalized: Partial<ProfilesType> =
      "class" in updates && saved && updates.class === saved.class
        ? { ...updates, team: saved.team }
        : "class" in updates && updates.class !== "teamleader"
          ? { ...updates, team: null }
          : updates;
    setRows((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, ...normalized } : user,
      ),
    );
  };

  // 変更を破棄して、読み込み時点（直前の保存成功時点）の値に戻す。編集中に新しい一覧が
  // 届いていた場合は、変更が無くなった直後の同期（上の useEffect）で最新値に置き換わる
  const handleDiscard = () => {
    setRows((prev) => prev.map((user) => baseline.get(user.id) ?? user));
    setShowErrors(false);
  };

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;
    if (validationErrors.size > 0) {
      setShowErrors(true);
      return;
    }

    const confirmed = await confirmAction(
      `${changedRows.length} 件のユーザー情報を保存しますか？`,
    );
    if (!confirmed) return;

    setIsSaving(true);
    try {
      // 書き込みに必要な項目だけを送る（name はサーバ側のエラーメッセージ用）
      const { error } = await bulkUpdateProfiles(
        changedRows.map(({ id, name, class: userClass, team, slack_id }) => ({
          id,
          name,
          class: userClass,
          team,
          slack_id,
        })),
      );
      if (error) {
        // 何も保存されていない。編集内容は画面に残す
        notifyError(error.message);
        return;
      }
      // 保存した値を新しい baseline にする（ハイライト・件数が消える）
      setBaseline((prev) => {
        const next = new Map(prev);
        changedRows.forEach((row) => next.set(row.id, row));
        return next;
      });
      // 編集中に届いて保留していた一覧（この保存より前の内容）を同期済みとして扱い、
      // 保存した値が保存前の内容でいったん戻って見えないようにする（次に届く一覧から反映する）
      syncedUserListRef.current = latestPropsRef.current.userList;
      syncedTeamListRef.current = latestPropsRef.current.teamList;
      // 保存後の値で並べ直す
      setRows((prev) => sortUserList(prev, latestPropsRef.current.teamList));
      setShowErrors(false);
      notifySuccess(`${changedRows.length} 件のユーザー情報を保存しました。`);
      router.refresh();
    } catch (error) {
      // 通信の失敗などで保存できたかどうか分からない（保存は 1 トランザクションのため、
      // 保存されていればすべて、されていなければ何も反映されていない）
      console.error("ユーザー情報の保存に失敗しました:", error);
      notifyError(
        "ユーザー情報の保存結果を確認できませんでした。画面を再読み込みして内容を確認してください。",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const errorMessages = formatUserValidationErrors(changedRows, visibleErrors);

  const tableHeads = (
    <Table.Tr key={elementListOfUser[0]}>
      {elementListOfUser.map((element, index) => (
        <Table.Th key={index} className="whitespace-nowrap px-4 text-center">
          {element}
        </Table.Th>
      ))}
    </Table.Tr>
  );

  return (
    <div className="relative p-4">
      <Title order={2} className="pb-4">
        ユーザーリスト
      </Title>
      {teamListError && (
        <Text c="red" size="sm" className="pb-4">
          チームの選択肢を取得できませんでした。チーム欄は現在の値のみ表示しています。
        </Text>
      )}
      <Group justify="space-between" className="pb-4">
        <Text size="sm" c={hasChanges ? "orange.8" : "dimmed"} fw={500}>
          {hasChanges ? `${changedRows.length} 件変更あり` : "変更はありません"}
        </Text>
        <Group gap="xs">
          <Button
            variant="default"
            disabled={!hasChanges || isSaving}
            onClick={handleDiscard}
          >
            変更を破棄
          </Button>
          <Button
            color="green"
            disabled={!hasChanges || isSaving}
            onClick={handleSave}
          >
            一括保存
          </Button>
        </Group>
      </Group>
      {errorMessages.length > 0 && (
        <Alert color="red" title="入力内容を確認してください" className="mb-4">
          <ul className="list-disc pl-5">
            {errorMessages.map((message, index) => (
              // 同名のユーザーで同じエラーが並ぶことがあるため、index を含める
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {!isMobile ? (
        // 768px 以上でもサイドメニューの分だけ幅が狭くなるため、入りきらない幅では
        // テーブルを横スクロールにする（Select・入力欄が潰れないように）
        <Table.ScrollContainer minWidth={760}>
          <Table>
            <Table.Thead>{tableHeads}</Table.Thead>
            <Table.Tbody>
              {rows.map((user) => (
                <UserTable
                  key={user.id}
                  userInfo={user}
                  teamList={teamList}
                  isChanged={changedIds.has(user.id)}
                  errors={visibleErrors.get(user.id)}
                  disabled={isSaving}
                  onUpdateUserList={handleUpdateUserList}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        rows.map((user) => (
          <UserCard
            key={user.id}
            userInfo={user}
            teamList={teamList}
            isChanged={changedIds.has(user.id)}
            errors={visibleErrors.get(user.id)}
            disabled={isSaving}
            onUpdateUserList={handleUpdateUserList}
          />
        ))
      )}
      <LoadingOverlay visible={isSaving} />
    </div>
  );
};

export default UserList;
