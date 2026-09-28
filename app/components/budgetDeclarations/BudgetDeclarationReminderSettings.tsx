"use client";

import {
  Alert,
  Badge,
  Button,
  Chip,
  Group,
  LoadingOverlay,
  Modal,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { normalizeBudgetDeclarationReminderTargetDays } from "@/app/utils/budgetDeclarationReminder";
import { updateBudgetDeclarationReminderTargetDays } from "@/app/utils/supabase/budgetDeclarationReminderSettings";
import { confirmAction } from "@/app/utils/confirmAction";
import { notifyError, notifySuccess } from "@/app/utils/notify";

const ALL_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

type Props = {
  // DynamicBudgetDeclarations 側での getBudgetDeclarationReminderSettings 失敗時は
  // null（モーダル内はフォームを表示せずエラー案内のみ表示する）
  initialTargetDays: number[] | null;
};

// 「リマインド設定」ボタンと、クリックで開く設定モーダル。
// 一覧（BudgetDeclarationList）のボタン行に常時マウントされる前提で、
// 保存済みの値（savedTargetDays）はモーダルの開閉をまたいでここで保持する
const BudgetDeclarationReminderSettings = ({ initialTargetDays }: Props) => {
  const [opened, setOpened] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(
    (initialTargetDays ?? []).map(String),
  );
  // 保存成功時のみ更新する「現在保存されている対象日」。selectedDays（未保存の
  // ドラフト）と分けているのは、保存前にチップを外しただけで「現在リマインドは
  // 無効です」と表示されてしまう（キャンセル・保存失敗時も実際は無効化されて
  // いない）事故を防ぐため。「現在」の判定は必ずこちらを見る
  const [savedTargetDays, setSavedTargetDays] = useState<number[]>(
    initialTargetDays ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  // 保存前の確認ダイアログ（confirmAction）を表示している間だけ true。
  // Mantine 7.13 では開いている Modal すべてが window の Esc を拾うため、確認ダイアログを
  // Esc で閉じると設定モーダルまで閉じて未保存の選択が破棄されてしまう。確認中は閉じない
  const [isConfirming, setIsConfirming] = useState(false);

  const isFetchFailed = initialTargetDays === null;

  const openModal = () => {
    // キャンセル等で閉じたときの未保存の選択は破棄し、開くたびに
    // 最後に保存された対象日で初期化する
    setSelectedDays(savedTargetDays.map(String));
    setOpened(true);
  };

  const closeModal = () => {
    // 保存中は閉じない（閉じた後に保存結果が反映されて表示と食い違うのを防ぐ）。
    // 確認ダイアログ表示中も閉じない（確認をキャンセルしたら開いたままにするため）
    if (isLoading || isConfirming) return;
    setOpened(false);
  };

  const handleSave = async () => {
    const normalized = normalizeBudgetDeclarationReminderTargetDays(
      selectedDays.map(Number),
    );

    let confirmed: boolean;
    try {
      setIsConfirming(true);
      confirmed = await confirmAction(
        normalized.length === 0
          ? "対象日を空にして保存すると、事前収支申告の未申告リマインドが停止します。よろしいですか？"
          : "リマインド対象日を更新しますか？",
      );
    } finally {
      setIsConfirming(false);
    }
    // 確認をキャンセルした場合はモーダルを開いたままにする
    if (!confirmed) return;

    try {
      setIsLoading(true);
      const { error } =
        await updateBudgetDeclarationReminderTargetDays(normalized);
      if (error) {
        // 保存失敗時はモーダルを開いたままにする（選択をやり直せるように）
        notifyError(error.message);
        return;
      }
      setSelectedDays(normalized.map(String));
      setSavedTargetDays(normalized);
      notifySuccess("リマインド設定を更新しました。");
      setOpened(false);
    } catch (error) {
      console.error("リマインド設定の保存に失敗しました。", error);
      notifyError("リマインド設定の保存に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Group gap="xs">
        {/* 常時展開しなくなった分、リマインドが無効になっていることに気付けるよう
            ボタンの横に表示する（取得失敗時は状態が不明なので出さない） */}
        {!isFetchFailed && savedTargetDays.length === 0 && (
          <Badge color="yellow">リマインド無効</Badge>
        )}
        <Button type="button" size="xs" variant="light" onClick={openModal}>
          リマインド設定
        </Button>
      </Group>
      <Modal
        opened={opened}
        onClose={closeModal}
        title="リマインド設定"
        size="lg"
        closeButtonProps={{ "aria-label": "閉じる" }}
      >
        {isFetchFailed ? (
          <Alert color="red" title="リマインド設定の取得に失敗しました">
            時間をおいてページを再読み込みしてください。
          </Alert>
        ) : (
          <div className="relative">
            <LoadingOverlay visible={isLoading} />
            <Text size="sm" c="dimmed" mb="xs">
              未申告チームへの Slack
              リマインド対象日（JST）を選択してください。29〜31日は存在しない月があり、その月はスキップされます。
            </Text>
            {savedTargetDays.length === 0 ? (
              <Alert color="yellow" title="現在リマインドは無効です" mb="sm">
                対象日が選択されていないため、Slack リマインドは送信されません。
              </Alert>
            ) : (
              selectedDays.length === 0 && (
                <Alert
                  color="yellow"
                  title="保存するとリマインドが無効になります"
                  mb="sm"
                >
                  対象日の選択がすべて解除されています。このまま保存すると Slack
                  リマインドが停止します。
                </Alert>
              )
            )}
            <Chip.Group
              multiple
              value={selectedDays}
              onChange={setSelectedDays}
            >
              <Group gap="xs">
                {ALL_DAYS.map((day) => (
                  <Chip key={day} value={String(day)} size="sm">
                    {day}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <Group justify="flex-end" mt="lg">
              <Button variant="default" onClick={closeModal}>
                キャンセル
              </Button>
              <Button type="button" disabled={isLoading} onClick={handleSave}>
                保存
              </Button>
            </Group>
          </div>
        )}
      </Modal>
    </>
  );
};

export default BudgetDeclarationReminderSettings;
