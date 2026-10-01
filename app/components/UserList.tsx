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
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { groupUsersByRole, teamRowColor } from "../utils/userListGroup";
import { useViewportSize } from "@mantine/hooks";
import { useReportDashboardUnsavedChanges } from "./dashboard/DashboardUnsavedChanges";
import UserCard from "./UserCard";
import UserTable from "./UserTable";

const elementListOfUser = [
  "名前",
  "メールアドレス",
  "権限",
  "チーム",
  "slack ID",
];

// Team options: a Select shows blank when value is not in data, so prepend the current value if missing (disabled/renamed team, or fetch failure) so admins can see the current team.
export const teamOptionsFor = (team: string | null, teamList: string[]) =>
  team && !teamList.includes(team) ? [team, ...teamList] : teamList;

type Props = {
  userList: ProfilesType[];
  // Team options fetched server-side (DynamicDashboardUsers); fetching per row from the client would run one Server Action per row serially and delay the team column.
  teamList: string[];
  teamListError?: boolean;
};

const toRowMap = (users: ProfilesType[]) =>
  new Map(users.map((user) => [user.id, user]));

const UserList = ({ userList, teamList, teamListError = false }: Props) => {
  const router = useRouter();
  // Sort by role -> team -> name (sortUserList) only on load and after a successful save, not while editing (a moving row would be lost).
  const [rows, setRows] = useState<ProfilesType[]>(() =>
    sortUserList(userList, teamList),
  );
  // Rows when loaded (or at the last successful save); changed rows are highlighted and only they are sent on save (same as ExtraEntryList).
  const [baseline, setBaseline] = useState(() => toRowMap(userList));
  const [isSaving, setIsSaving] = useState(false);
  // router.refresh() resolves after the server render; keep the overlay until then.
  const [isRefreshPending, startRefresh] = useTransition();
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
  // A row whose role was edited stays in its saved section until the save succeeds (so it does not vanish while editing); baseline moves on save.
  const sections = useMemo(
    () =>
      groupUsersByRole(rows, (user) => {
        // Not `saved?.class ?? user.class`: a saved null role must stay in the "unset" section while edited.
        const saved = baseline.get(user.id);
        return saved ? saved.class : user.class;
      }),
    [rows, baseline],
  );
  const validationErrors = useMemo(
    () => validateUserUpdates(changedRows),
    [changedRows],
  );
  const visibleErrors = showErrors
    ? validationErrors
    : new Map<number, UserValidationErrors>();

  // Sync from the server list (router.refresh etc.) only when there are no unsaved changes. A list that arrived while editing is synced once changes end (discard, reverted, saved); remember the synced list in a ref so the latest is not missed and a stale baseline does not overwrite another admin's values on the next save.
  const syncedUserListRef = useRef(userList);
  const syncedTeamListRef = useRef(teamList);
  // Latest props, so a successful save can treat them as synced.
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

  // Reports unsaved state to DashboardUnsavedChangesProvider (confirm in DashboardNav, beforeunload warning).
  useReportDashboardUnsavedChanges(hasChanges);

  const handleUpdateUserList = (
    userId: number,
    updates: Partial<ProfilesType>,
  ) => {
    // Reverting the role to its loaded value restores the team too (otherwise the team stays cleared with no "changed" state or error); changing to a non-teamleader role clears the team (PC and mobile).
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

  // Discard changes back to the loaded (or last saved) values; a list that arrived while editing syncs right after via the effect above.
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
      // Send only fields needed for writing (name is for server error messages).
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
        // Nothing was saved; keep the edits on screen.
        notifyError(error.message);
        return;
      }
      setBaseline((prev) => {
        const next = new Map(prev);
        changedRows.forEach((row) => next.set(row.id, row));
        return next;
      });
      // Treat the list held during editing (pre-save content) as synced so saved values do not flash back; apply from the next list.
      syncedUserListRef.current = latestPropsRef.current.userList;
      syncedTeamListRef.current = latestPropsRef.current.teamList;
      setRows((prev) => sortUserList(prev, latestPropsRef.current.teamList));
      setShowErrors(false);
      notifySuccess(`${changedRows.length} 件のユーザー情報を保存しました。`);
      startRefresh(() => {
        router.refresh();
      });
    } catch (error) {
      // Outcome unknown (single transaction: all or nothing).
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
              // Include index: users with the same name can produce identical errors.
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {sections.map((section) => (
        <section
          key={section.key}
          className="pb-6"
          aria-labelledby={`user-section-${section.key}`}
        >
          <Title
            order={3}
            size="h4"
            className="pb-2"
            id={`user-section-${section.key}`}
          >
            {`${section.label}（${section.users.length} 名）`}
          </Title>
          {!isMobile ? (
            // Even at PC widths the side menu narrows the table, so scroll horizontally when it does not fit (keeps Select and inputs from being squashed).
            <Table.ScrollContainer minWidth={760}>
              <Table>
                <Table.Thead>{tableHeads}</Table.Thead>
                <Table.Tbody>
                  {section.users.map((user) => (
                    <UserTable
                      key={user.id}
                      userInfo={user}
                      teamList={teamList}
                      isChanged={changedIds.has(user.id)}
                      teamColor={teamRowColor(user.team, teamList)}
                      errors={visibleErrors.get(user.id)}
                      disabled={isSaving}
                      onUpdateUserList={handleUpdateUserList}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            section.users.map((user) => (
              <UserCard
                key={user.id}
                userInfo={user}
                teamList={teamList}
                isChanged={changedIds.has(user.id)}
                teamColor={teamRowColor(user.team, teamList)}
                errors={visibleErrors.get(user.id)}
                disabled={isSaving}
                onUpdateUserList={handleUpdateUserList}
              />
            ))
          )}
        </section>
      ))}
      <LoadingOverlay visible={isSaving || isRefreshPending} />
    </div>
  );
};

export default UserList;
