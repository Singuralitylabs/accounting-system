"use client";

import { BusinessType, CostType, MatterType } from "@/app/types/types";
import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Textarea,
  TextInput,
} from "@mantine/core";
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
  insertBusinessInfo,
  insertCostInfo,
  insertMatterInfo,
} from "../utils/supabaseServer";
import { CustomDatePicker } from "./CustomDatePicker";

const NewMatterForm = () => {
  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      id: 0,
      title: "",
      category: "",
      team: "",
      start_date: "",
      description: "",
      is_fixed: false,
      is_completed: false,
      user_id: 0,
      inserted_at: "",
      updated_at: "",
    },
  });

  const [costList, setCostList] = useState<CostType[]>([]);
  const [businessList, setBusinessList] = useState<BusinessType[]>([]);
  const [costIndex, setCostIndex] = useState<number>(1);
  const [businessIndex, setBusinessIndex] = useState<number>(1);

  const handleAddCost = () => {
    setCostList([
      ...costList,
      {
        id: costIndex,
        name: "",
        item: "",
        price: 0,
        certificate: "",
        comment: null,
        inserted_at: "2024-01-01",
        matter_id: 0,
        payment_target: "",
        period: null,
        updated_at: "2024-01-01",
        withholding: false,
        is_completed: false,
      },
    ]);
    setCostIndex(costIndex + 1);
  };

  const handleAddBusiness = () => {
    setBusinessList([
      ...businessList,
      {
        id: businessIndex,
        name: "",
        amount: 0,
        invoice_date: null,
        period_date: null,
        inserted_at: "2024-01-01",
        matter_id: 0,
        updated_at: "2024-01-01",
        is_completed: false,
      },
    ]);
    setBusinessIndex(businessIndex + 1);
  };

  const handleRemoveCost = (id: number) => {
    setCostList(costList.filter((cost) => cost.id !== id));
  };

  const handleRemoveBusiness = (id: number) => {
    setBusinessList(businessList.filter((business) => business.id !== id));
  };

  const handleAddMatterInfo = async (matterInfo: MatterType) => {
    try {
      const checkCreated = window.confirm(
        `案件[${matterInfo.title}]を作成しますか？`
      );
      if (!checkCreated) {
        alert(`案件[${matterInfo.title}]の作成を中止しました。`);
        return;
      }
      if (
        !matterInfo.title ||
        !matterInfo.category ||
        !matterInfo.team ||
        !matterInfo.start_date
      ) {
        alert(
          `案件名、分類、チーム、案件開始日のいずれかが空欄のため、案件の作成を中止しました。`
        );
        return;
      }
      matterInfo.is_fixed = window.confirm(
        `案件[${matterInfo.title}]を確定にしますか？\n確定後は経理の確認に入るため、変更できません。`
      );

      const totalAmount = businessList.reduce((acc, business) => {
        return business.amount ? acc + business.amount : acc;
      }, 0);
      const totalCost = costList.reduce((acc, cost) => {
        return cost.price ? acc + cost.price : acc;
      }, 0);

      const { newId, error: matterError } = await insertMatterInfo(
        matterInfo.title,
        matterInfo.category,
        matterInfo.team,
        matterInfo.start_date!,
        matterInfo.is_fixed!,
        totalAmount,
        businessList.length,
        totalCost,
        costList.length,
        matterInfo.description
      );
      if (matterError) throw new Error(matterError.message);
      if (!newId) throw new Error("案件IDの取得に失敗しました。");

      for (const cost of costList) {
        const { error: costError } = await insertCostInfo(
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

      for (const business of businessList) {
        const { error: businessError } = await insertBusinessInfo(
          business.name,
          business.amount!,
          business.invoice_date!,
          business.period_date!,
          newId
        );
        if (businessError) throw new Error(businessError.message);
      }

      alert(`${matterInfo.title}の新規登録を完了しました。[案件ID:${newId}]`);
      form.reset();
      setCostList([]);
      setBusinessList([]);
    } catch (error) {
      alert(`${matterInfo.title}の新規登録に失敗しました。`);
      console.error(error);
    }
  };

  return (
    <form
      className="p-4 w-auto"
      onSubmit={form.onSubmit((values) =>
        handleAddMatterInfo({
          ...values,
          total_amount: 0,
          total_cost: 0,
          business_count: 0,
          cost_count: 0,
          accounting_memo: "",
        })
      )}
    >
      <span className="text-red-700 text-sm">
        ※全て税抜金額をご記入ください。
      </span>
      <h2 className="my-4">基本情報</h2>
      <div className="md:flex gap-4 w-full">
        <TextInput
          className="w-full"
          withAsterisk
          required
          placeholder="案件名をご記入ください。"
          label="案件名"
          key={form.key("title")}
          {...form.getInputProps("title")}
        />
        <Select
          withAsterisk
          required
          className="md:pt-0 pt-4 w-full"
          placeholder="案件に適した分類を選択して下さい。"
          label="分類"
          data={categoryList}
          clearable
          key={form.key("category")}
          {...form.getInputProps("category")}
        />
        <Select
          withAsterisk
          required
          className="md:pt-0 pt-4 w-full"
          placeholder="案件担当のチームを選択して下さい。"
          label="チーム"
          data={teamList}
          clearable
          key={form.key("team")}
          {...form.getInputProps("team")}
        />
        <CustomDatePicker
          label="案件開始日"
          required
          placeholder="案件開始日をご記入ください。"
          value={form.getValues().start_date}
          onChange={(date) => form.setFieldValue("start_date", date || "")}
          className="md:pt-0 pt-4 w-full"
          showIcon
        />
      </div>

      <Textarea
        className="pt-4 w-full"
        placeholder="案件に関して追加で説明があればご記入ください。"
        label="説明"
        key={form.key("description")}
        {...form.getInputProps("description")}
      />

      <h2 className="mt-8">取引先情報</h2>
      <span className="text-sm">
        ※取引先から協会への報酬が発生する場合にご記入ください。
      </span>
      <div>
        {businessList.map((businessInfo, index) => (
          <div
            key={businessInfo.id}
            className="md:flex md:border-none border rounded-lg md:p-0 p-2 my-2 items-center md:bg-slate-50 bg-green-50"
          >
            <div className="md:hidden flex justify-between w-full m-2">
              <div>取引先{index + 1}</div>
              <button
                className="h-full mx-4 text-lg hover:cursor-pointer w-4 ml-auto items-center justify-center hover:text-blue-500"
                onClick={() => handleRemoveBusiness(businessInfo.id)}
              >
                <FaRegTrashAlt />
              </button>
            </div>

            <div className="md:flex gap-4 w-full">
              <div className="sm:flex md:my-0 my-2 gap-4 w-full">
                <TextInput
                  placeholder="取引先名をご記入ください。"
                  className="flex-grow sm:my-0 my-2 "
                  value={businessInfo.name}
                  onChange={(event) =>
                    setBusinessList(
                      businessList.map((businessVal) =>
                        businessVal.id === businessInfo.id
                          ? { ...businessVal, name: event.target.value }
                          : businessVal
                      )
                    )
                  }
                />
                <NumberInput
                  placeholder="報酬額をご記入ください。"
                  className="flex-grow"
                  value={businessInfo.amount! || ""}
                  prefix="¥"
                  allowNegative={false}
                  allowDecimal={false}
                  thousandSeparator=","
                  onChange={(value) =>
                    setBusinessList(
                      businessList.map((businessVal) =>
                        businessVal.id === businessInfo.id
                          ? { ...businessVal, amount: Number(value) }
                          : businessVal
                      )
                    )
                  }
                />
              </div>
              <div className="sm:flex gap-4 w-full">
                <CustomDatePicker
                  placeholder="請求日をご記入ください。"
                  value={businessInfo.invoice_date}
                  onChange={(date) => {
                    setBusinessList(
                      businessList.map((businessVal) =>
                        businessVal.id === businessInfo.id
                          ? { ...businessVal, invoice_date: date }
                          : businessVal
                      )
                    );
                  }}
                  className="flex-grow sm:my-0 my-2"
                />
                <CustomDatePicker
                  placeholder="振込期限をご記入ください。"
                  value={businessInfo.period_date}
                  onChange={(date) => {
                    setBusinessList(
                      businessList.map((businessVal) =>
                        businessVal.id === businessInfo.id
                          ? { ...businessVal, period_date: date }
                          : businessVal
                      )
                    );
                  }}
                  className="flex-grow sm:my-0 my-2"
                />
              </div>
            </div>
            <button
              className="hidden text-lg hover:cursor-pointer w-4 ml-2 md:flex items-center justify-center hover:text-blue-500"
              onClick={() => handleRemoveBusiness(businessInfo.id)}
            >
              <FaRegTrashAlt />
            </button>
          </div>
        ))}

        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          onClick={handleAddBusiness}
        >
          取引先追加
        </Button>
      </div>

      <h2 className="mt-8">コスト情報</h2>
      <span className="text-sm">
        ※協会からの支払いが発生する場合にご記入ください。
      </span>
      <div>
        {costList.map((cost, index) => (
          <div
            key={cost.id}
            className="lg:flex items-center my-2 lg:p-0 p-2 lg:border-none border rounded-lg lg:bg-slate-50 bg-slate-100"
          >
            <div className="lg:hidden flex justify-between w-full m-2">
              <div>コスト{index + 1}</div>
              <div className="flex gap-2">
                <button
                  className="h-full mx-4 text-lg hover:cursor-pointer w-4 ml-auto items-center justify-center hover:text-blue-500"
                  onClick={() => handleRemoveCost(cost.id)}
                >
                  <FaRegTrashAlt />
                </button>
              </div>
            </div>
            <div className="flex-1 lg:flex gap-2 min-w-0">
              <div className="sm:flex gap-2 lg:mb-0 mb-2 flex-1">
                <TextInput
                  placeholder="コスト名をご記入ください。"
                  className="flex-grow sm:mb-0 mb-2"
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
                  className="flex-grow sm:mb-0 mb-2 sm:w-40"
                  placeholder="品目を選択してください。"
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
                <TextInput
                  placeholder="支払い先の名前をご記入ください。"
                  className="flex-grow sm:mb-0 mb-2"
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
              </div>
              <div className="sm:flex gap-2 flex-1">
                <NumberInput
                  placeholder="金額をご記入ください。"
                  className="flex-grow sm:mb-0 mb-2"
                  value={cost.price || ""}
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
                <CustomDatePicker
                  placeholder="支払い期限をご記入ください。"
                  value={cost.period}
                  onChange={(date) => {
                    setCostList(
                      costList.map((costVal) =>
                        costVal.id === cost.id
                          ? { ...costVal, period: date }
                          : costVal
                      )
                    );
                  }}
                  className="flex-grow sm:mb-0 mb-2"
                />
                <Select
                  className="flex-grow sm:mb-0 mb-2"
                  placeholder="支払いの通知方法を選択してください。"
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
                <div className="flex items-center whitespace-nowrap">
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
                </div>
              </div>
            </div>
            <div className="hidden lg:flex">
              <button
                className="text-lg hover:cursor-pointer w-4 ml-2 flex items-center justify-center hover:text-blue-500"
                onClick={() => handleRemoveCost(cost.id)}
              >
                <FaRegTrashAlt />
              </button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          onClick={handleAddCost}
        >
          コスト追加
        </Button>
      </div>

      <Group className="pt-8" justify="flex-end" mt="md">
        <Button color="pink" type="submit">
          作成
        </Button>
      </Group>
    </form>
  );
};

export default NewMatterForm;
