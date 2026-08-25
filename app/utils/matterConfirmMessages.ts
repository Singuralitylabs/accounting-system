export const getUpdateMatterConfirmMessage = (
  title: string,
  originalIsFixed: boolean | null | undefined,
  nextIsFixed: boolean | null | undefined,
) => {
  const isNewApplication = !originalIsFixed && nextIsFixed;
  const isPostSubmissionUpdate = originalIsFixed && nextIsFixed;
  if (isNewApplication) {
    return `案件[${title}]を経理申請しますか？\n申請後に更新が必要となった場合、経理まで連絡が必要です。`;
  }
  if (isPostSubmissionUpdate) {
    return `案件[${title}]を更新しますか？更新内容は経理に通知されます。`;
  }
  return `案件[${title}]を更新しますか？`;
};

export const DELETE_MATTER_CONFIRM_MESSAGE =
  "本当に削除しますか？\nこの操作は取り消せません。";
