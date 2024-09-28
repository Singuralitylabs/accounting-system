"use client";

import { CostType, MatterType } from "@/app/types/types";
import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import { FaRegTrashAlt } from "react-icons/fa";
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
  const [costList, setCostList] = useState<InputCostType[]>([
    { id: 0, name: "", item: "", price: 0 },
  ]);
  const [costIndex, setCostIndex] = useState<number>(1);

  const addCost = () => {
    setCostList([...costList, { id: costIndex, name: "", item: "", price: 0 }]);
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
        placeholder="例）新潟県版ボードゲーム制作"
        label="案件名"
        key={form.key("title")}
        {...form.getInputProps("title")}
        onChange={(event) =>
          setMatterInfo({ ...matterInfo, title: event.currentTarget.value })
        }
      />

      <Select
        withAsterisk
        className="pt-4"
        placeholder="案件に適した分類を選択して下さい。"
        label="分類"
        data={["会員費", "受託案件", "ボードゲーム制作", "イベント"]}
        clearable
        onChange={(event) =>
          event ? setMatterInfo({ ...matterInfo, category: event }) : null
        }
      />

      <NumberInput
        withAsterisk
        className="pt-4"
        label="金額"
        prefix="¥"
        allowNegative={false}
        allowDecimal={false}
        thousandSeparator=","
        key={form.key("amount")}
        {...form.getInputProps("amount")}
        onChange={(event) =>
          setMatterInfo({ ...matterInfo, amount: Number(event) })
        }
      />

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

      <h1 className="pt-8 text-xl text-gray-700 font-bold">コスト</h1>
      <div className="pt-4">
        {costList.map((cost) => (
          <div className="flex items-center pb-2" key={cost.id}>
            <Group gap="sm" className="flex-grow" grow>
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
                data={["システム料", "外注費", "備品購入"]}
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
            <div
              className="h-full px-2 text-lg hover:cursor-pointer ml-auto flex items-center justify-center"
              onClick={() => removeCost(cost.id)}
            >
              <FaRegTrashAlt />
            </div>
          </div>
        ))}

        <Button
          type="button"
          fullWidth
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
