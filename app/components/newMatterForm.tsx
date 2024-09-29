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

type InputCostType = {
  id: number;
  name: string;
  item: string;
  price: number;
};

const NewMatterForm = () => {
  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      title: "",
      classification: "",
      billing_amount: 0,
      isFixed: false,
      costList: [],
    },
  });

  const [matterInfo, setMatterInfo] = useState<MatterType>({
    id: 0,
    title: "",
    category: "",
    team: "",
    amount: 0,
    is_fixed: false,
    is_completed: false,
    inserted_at: "",
    user_id: 0,
    billing_address: "",
    invoice_date: "",
    period_date: "",
    start_date: "",
    updated_at: "",
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

  const handleAddMatterInfo = async () => {
    // try {
    //   const { newId, error: matterError } = await insertMatterInfoInSupabase(matterInfo);
    //   if (matterError) throw new Error(matterError.message);
    //   for (const cost of costList) {
    //     const costInfo: CostType = {
    //       id: 0,
    //       name: cost.name,
    //       price: cost.price,
    //       item: cost.item,
    //       matter_id: newId,
    //       inserted_at: "",
    //     };
    //     const { error: costError } = await insertCostInfoInSupabase(costInfo);
    //     if (costError) throw new Error(costError.message);
    //   }
    //   alert(`${matterInfo.title}の新規登録を完了しました。`);
    //   form.reset();
    //   setCostList([{ id: 0, name: "", item: "", price: 0 }]);
    // } catch (error) {
    //   alert(`${matterInfo.title}の新規登録に失敗しました。`);
    //   console.error(error);
    // }
  };

  return (
    <form
      className="p-4 lg:p-16 w-auto"
      onSubmit={form.onSubmit((values) => console.log(values))}
    >
      <TextInput
        withAsterisk
        required
        placeholder="案件名をご入力ください。（例）10月_世界版ボードゲーム制作"
        label="案件名"
        key={form.key("title")}
        {...form.getInputProps("title")}
        onChange={(event) =>
          setMatterInfo({ ...matterInfo, title: event.currentTarget.value })
        }
      />

      <div className="sm:flex gap-4 w-full">
        <Select
          withAsterisk
          className="pt-4 w-full"
          placeholder="案件に適した分類を選択して下さい。"
          label="分類"
          data={categoryList}
          clearable
          onChange={(event) =>
            event ? setMatterInfo({ ...matterInfo, category: event }) : null
          }
        />

        <Select
          withAsterisk
          className="pt-4 w-full"
          placeholder="案件を担当するチームを選択して下さい。"
          label="チーム"
          data={teamList}
          clearable
          onChange={(event) =>
            event ? setMatterInfo({ ...matterInfo, team: event }) : null
          }
        />
      </div>

      <div className="sm:flex gap-4 w-full">
        <TextInput
          className="pt-4 w-full"
          placeholder="協会から案件の報酬を請求するお相手名を入力して下さい。"
          label="請求先"
          key={form.key("billing_address")}
          {...form.getInputProps("billing_address")}
          onChange={(event) =>
            setMatterInfo({
              ...matterInfo,
              billing_address: event.currentTarget.value,
            })
          }
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
          onChange={(event) =>
            setMatterInfo({ ...matterInfo, amount: Number(event) })
          }
        />
      </div>

      <div className="sm:flex gap-4 w-full">
        <DateInput
          withAsterisk
          className="pt-4 w-full"
          label="案件開始日"
          placeholder="案件を開始した日付をご入力ください。"
          valueFormat="YYYY/MM/DD"
          onChange={(event) => {
            const dateString = event ? event.toISOString().split("T")[0] : null;
            setMatterInfo({ ...matterInfo, start_date: dateString });
          }}
        />
        <DateInput
          className="pt-4 w-full"
          label="請求日"
          placeholder="案件の報酬を請求する日付をご入力ください。"
          valueFormat="YYYY/MM/DD"
          onChange={(event) => {
            const dateString = event ? event.toISOString().split("T")[0] : null;
            setMatterInfo({ ...matterInfo, start_date: dateString });
          }}
        />
        <DateInput
          className="pt-4 w-full"
          label="振込期限"
          placeholder="案件の報酬の振込期限をご入力ください。"
          valueFormat="YYYY/MM/DD"
          onChange={(event) => {
            const dateString = event ? event.toISOString().split("T")[0] : null;
            setMatterInfo({ ...matterInfo, start_date: dateString });
          }}
        />
      </div>

      <Checkbox
        mt="md"
        className="pt-4"
        label="確定"
        key={form.key("is_fixed")}
        {...form.getInputProps("is_fixed", { type: "checkbox" })}
        onChange={(event) =>
          setMatterInfo({
            ...matterInfo,
            is_fixed: event.currentTarget.checked,
          })
        }
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
        <Button type="submit" onClick={handleAddMatterInfo}>
          作成
        </Button>
      </Group>
    </form>
  );
};

export default NewMatterForm;
