import { Paper, Text } from "@mantine/core";

type Props = {
  // Message with placeholders already expanded by the caller.
  text: string;
  // Part the app appends after the message (e.g. team list, deadline, URL); drawn dimmer so it reads as automatic.
  autoText?: string;
  "data-testid"?: string;
};

export const SlackMessagePreview = ({
  text,
  autoText,
  "data-testid": testId,
}: Props) => (
  <div>
    <Text size="xs" fw={500} c="dimmed" mb={4}>
      プレビュー（サンプル値）
    </Text>
    <Paper
      withBorder
      p="sm"
      bg="gray.0"
      className="whitespace-pre-wrap break-words"
      data-testid={testId}
    >
      <Text size="sm" component="span" className="whitespace-pre-wrap">
        {text}
      </Text>
      {autoText && (
        <Text
          size="sm"
          c="dimmed"
          component="span"
          className="whitespace-pre-wrap"
          data-testid="slack-preview-auto"
        >
          {"\n"}
          {autoText}
        </Text>
      )}
    </Paper>
  </div>
);
