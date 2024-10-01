"use client";

import { CostType, MatterType } from "@/app/types/types";
import {
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  Select,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import { FaRegTrashAlt } from "react-icons/fa";
import {
  categoryList,
  certificateList,
  itemList,
  teamList,
} from "../types/params";
import {
  insertCostInfoInSupabase,
  insertMatterInfoInSupabase,
} from "../utils/supabaseServer";

const NewMatterForm = () => {
  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      id: 0,
      title: "",
      category: "",
      amount: 0,
      team: "",
      billing_address: "",
      start_date: "",
      invoice_date: "",
      period_date: "",
      description: "",
      is_fixed: false,
      is_completed: false,
      user_id: 0,
      inserted_at: "",
      updated_at: "",
      costList: [],
    },
  });

  const [costList, setCostList] = useState<CostType[]>([]);
  const [costIndex, setCostIndex] = useState<number>(1);

  const addCost = () => {
    setCostList([
      ...costList,
      {
        id: costIndex,
        name: "",
        item: "",
        price: 0,
        certificate: "請求書",
        comment: null,
        inserted_at: "2024-01-01",
        matter_id: 0,
        payment_target: "",
        period: null,
        updated_at: "2024-01-01",
        withholding: false,
      },
    ]);
    setCostIndex(costIndex + 1);
  };

  const removeCost = (id: number) => {
    setCostList(costList.filter((cost) => cost.id !== id));
  };

  const handleAddMatterInfo = async (matterInfo: MatterType) => {
    try {
      console.log(JSON.stringify(matterInfo));
      const { newId, error: matterError } = await insertMatterInfoInSupabase(
        matterInfo.title,
        matterInfo.category,
        matterInfo.team,
        matterInfo.amount,
        matterInfo.billing_address!,
        matterInfo.start_date!,
        matterInfo.invoice_date,
        matterInfo.period_date,
        matterInfo.is_fixed!,
        matterInfo.description
      );
      console.log(newId);
      if (matterError) throw new Error(matterError.message);
      if (!newId) throw new Error("案件IDの取得に失敗しました。");
      for (const cost of costList) {
        const { error: costError } = await insertCostInfoInSupabase(
          cost.name,
          cost.item,
          cost.payment_target,
          cost.price,
          cost.period!,
          cost.certificate,
          cost.withholding,
          newId,
          cost.comment!
        );
        if (costError) throw new Error(costError.message);
      }
      alert(`${matterInfo.title}の新規登録を完了しました。`);
      form.reset();
      setCostList([]);
    } catch (error) {
      alert(`${matterInfo.title}の新規登録に失敗しました。`);
      console.error(error);
    }
  };

  return (
    <form
      className="p-4 lg:p-16 w-auto"
      onSubmit={form.onSubmit((values) => handleAddMatterInfo(values))}
    >
      <div className="sm:flex gap-4 w-full">
        <TextInput
          className="w-full"
          withAsterisk
          required
          placeholder="案件名をご入力ください。（例）10月_世界版ボードゲーム制作"
          label="案件名"
          key={form.key("title")}
          {...form.getInputProps("title")}
        />
        <TextInput
          className="w-full"
          placeholder="協会から案件の報酬を請求するお相手名を入力して下さい。"
          label="請求先"
          key={form.key("billing_address")}
          {...form.getInputProps("billing_address")}
        />
      </div>
      <div className="sm:flex gap-4 w-full">
        <Select
          withAsterisk
          className="pt-4 w-full"
          placeholder="案件に適した分類を選択して下さい。"
          label="分類"
          data={categoryList}
          clearable
          key={form.key("category")}
          {...form.getInputProps("category")}
        />
        <Select
          withAsterisk
          className="pt-4 w-full"
          placeholder="案件を担当するチームを選択して下さい。"
          label="チーム"
          data={teamList}
          clearable
          key={form.key("team")}
          {...form.getInputProps("team")}
        />
        <NumberInput
          withAsterisk
          className="pt-4 w-full"
          label="金額"
          prefix="¥"
          placeholder="¥0"
          allowNegative={false}
          allowDecimal={false}
          thousandSeparator=","
          key={form.key("amount")}
          {...form.getInputProps("amount")}
        />
      </div>

      <div className="sm:flex gap-4 w-full">
        <DateInput
          withAsterisk
          className="pt-4 w-full"
          label="案件開始日"
          placeholder="案件を開始した日付をご入力ください。"
          valueFormat="YYYY/MM/DD"
          key={form.key("start_date")}
          {...form.getInputProps("start_date")}
        />
        <DateInput
          className="pt-4 w-full"
          label="請求日"
          placeholder="案件の報酬を請求する日付をご入力ください。"
          valueFormat="YYYY/MM/DD"
          key={form.key("invoice_date")}
          {...form.getInputProps("invoice_date")}
        />
        <DateInput
          className="pt-4 w-full"
          label="振込期限"
          placeholder="案件の報酬の振込期限をご入力ください。"
          valueFormat="YYYY/MM/DD"
          key={form.key("period_date")}
          {...form.getInputProps("period_date")}
        />
      </div>

      <TextInput
        className="pt-4 w-full"
        placeholder="案件に関して追加で説明があればご記入ください。"
        label="説明"
        key={form.key("description")}
        {...form.getInputProps("description")}
      />

      <div className="pt-4">
        {costList.map((cost, index) => (
          <Card
            key={cost.id}
            className="sm:flex items-center mb-4"
            withBorder
            radius="lg"
            shadow="sm"
            padding="lg"
            aria-label="コスト"
          >
            <div className="flex justify-between w-full mb-2">
              <div>コスト{index + 1}</div>
              <div
                className="h-full px-4 text-lg hover:cursor-pointer w-4 ml-auto items-center justify-center"
                onClick={() => removeCost(cost.id)}
              >
                <FaRegTrashAlt />
              </div>
            </div>
            <div className="flex-grow">
              <div className="flex pb-2">
                <Group gap="sm" className="flex-grow w-full">
                  <TextInput
                    placeholder="品名をご記入ください。"
                    className="flex-grow"
                    value={cost.name}
                    onChange={(event) =>
                      setCostList(
                        costList.map((costVal) =>
                          costVal.id === cost.id
                            ? { ...costVal, name: event.target.value }
                            : costVal
                        )
                      )
                    }
                  />
                  <Select
                    className="flex-grow"
                    placeholder="品目を選択ください。"
                    data={itemList}
                    required
                    value={cost.item}
                    onChange={(value) =>
                      setCostList(
                        costList.map((costVal) =>
                          costVal.id === cost.id
                            ? { ...costVal, item: value || "" }
                            : costVal
                        )
                      )
                    }
                  />
                  <NumberInput
                    placeholder="¥0"
                    className="flex-grow"
                    value={cost.price}
                    prefix="¥"
                    allowNegative={false}
                    allowDecimal={false}
                    thousandSeparator=","
                    onChange={(value) =>
                      setCostList(
                        costList.map((costVal) =>
                          costVal.id === cost.id
                            ? { ...costVal, price: Number(value) }
                            : costVal
                        )
                      )
                    }
                  />
                </Group>
              </div>
              <div className="sm:flex flex-col sm:flex-row items-center pb-2">
                <Group gap="sm" className="flex-grow">
                  <DateInput
                    className="flex-grow"
                    placeholder="支払い期限をご記入ください。"
                    valueFormat="YYYY/MM/DD"
                    onChange={(event) => {
                      const dateString = event
                        ? event.toISOString().split("T")[0]
                        : null;
                      setCostList(
                        costList.map((costVal) =>
                          costVal.id === cost.id
                            ? { ...costVal, period: dateString }
                            : costVal
                        )
                      );
                    }}
                  />
                  <TextInput
                    placeholder="支払い先の名前をご記入ください。"
                    className="flex-grow"
                    value={cost.payment_target}
                    onChange={(event) =>
                      setCostList(
                        costList.map((costVal) =>
                          costVal.id === cost.id
                            ? { ...costVal, payment_target: event.target.value }
                            : costVal
                        )
                      )
                    }
                  />
                  <Select
                    className="flex-grow"
                    placeholder="支払いの通知方法を選択ください。"
                    data={certificateList}
                    required
                    value={cost.certificate}
                    onChange={(value) =>
                      setCostList(
                        costList.map((costVal) =>
                          costVal.id === cost.id
                            ? { ...costVal, certificate: value || "" }
                            : costVal
                        )
                      )
                    }
                  />
                  <Checkbox
                    label="源泉徴収あり"
                    key={form.key("withholding")}
                    {...form.getInputProps("withholding", { type: "checkbox" })}
                    onChange={(value) =>
                      setCostList(
                        costList.map((costVal) =>
                          costVal.id === cost.id
                            ? {
                                ...costVal,
                                withholding: value.currentTarget.checked,
                              }
                            : costVal
                        )
                      )
                    }
                  />
                </Group>
              </div>
              <div className="flex items-center pb-2">
                <TextInput
                  placeholder="コメントがあればご記入ください。"
                  className="flex-grow w-full"
                  value={cost.comment ? cost.comment : ""}
                  onChange={(event) =>
                    setCostList(
                      costList.map((costVal) =>
                        costVal.id === cost.id
                          ? { ...costVal, comment: event.target.value }
                          : costVal
                      )
                    )
                  }
                />
              </div>
            </div>
          </Card>
        ))}

        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          onClick={addCost}
        >
          コスト追加
        </Button>
      </div>

      <Group className="pt-8" justify="flex-end" mt="md">
        <Button type="submit">作成</Button>
      </Group>
    </form>
  );
};

export default NewMatterForm;
