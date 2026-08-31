import Link from "next/link";
import { Suspense } from "react";
import { Button, Group } from "@mantine/core";
import PageTitle from "../components/PageTitle";
import DynamicMatterList from "../components/dynamic/DynamicMatterList";
import { LoadingSpinner } from "../components/LoadingSpinner";

const UserMatterPage = () => {
  return (
    <main>
      <PageTitle title="案件カード" />
      <Group justify="flex-end" className="px-8 pb-4">
        <Button component={Link} href="/new">
          + 新規作成
        </Button>
      </Group>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicMatterList />
      </Suspense>
    </main>
  );
};

export default UserMatterPage;
