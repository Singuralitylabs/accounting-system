"use client";

import { BusinessType, CostType, MatterType } from "@/app/types/types";
import { Button, Group } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import {
  insertBusinessInfo,
  insertCostInfo,
  insertMatterInfo,
} from "../utils/supabaseServer";
import BusinessBlock from "./BusinessBlock";
import CostBlock from "./CostBlock";
import { MatterFormValues, MatterInfoBlock } from "./MatterInfoBlock";

const NewMatterForm = () => {
  const initialFormValues: MatterFormValues = {
    id: 0,
    title: "",
    category: "",
    team: "",
    start_date: "",
    description: "",
    is_fixed: false,
    total_amount: null,
    business_count: null,
    total_cost: null,
    cost_count: null,
    user_id: 1,
    inserted_at: "",
    updated_at: "",
    is_completed: false,
    accounting_memo: null,
  };

  const form = useForm<MatterFormValues>({
    mode: "uncontrolled",
    initialValues: initialFormValues,
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
      form.setValues(initialFormValues);
      setCostList([]);
      setBusinessList([]);
      setCostIndex(1);
      setBusinessIndex(1);
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
          accounting_memo: null,
          inserted_at: "",
          is_completed: false,
          updated_at: "",
          user_id: 1,
        })
      )}
    >
      <span className="text-red-700 text-sm">
        ※全て税抜金額をご記入ください。
      </span>
      <h2 className="mt-4">基本情報</h2>
      <MatterInfoBlock form={form} bgColor="bg-slate-50" />

      <h2 className="mt-8">取引先情報</h2>
      <span className="text-sm">
        ※取引先から協会への報酬が発生する場合にご記入ください。
      </span>
      {businessList.map((businessInfo, index) => (
        <BusinessBlock
          key={businessInfo.id}
          businessInfo={businessInfo}
          formType="new"
          index={index}
          onRemoveBusiness={handleRemoveBusiness}
          onBusinessUpdate={(updatedBusiness) => {
            setBusinessList(
              businessList.map((businessVal) =>
                businessVal.id === updatedBusiness.id
                  ? updatedBusiness
                  : businessVal
              )
            );
          }}
        />
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

      <h2 className="mt-8">コスト情報</h2>
      <span className="text-sm">
        ※協会からの支払いが発生する場合にご記入ください。
      </span>
      {costList.map((costInfo, index) => (
        <CostBlock
          key={costInfo.id}
          costInfo={costInfo}
          formType="new"
          index={index}
          onRemoveCost={handleRemoveCost}
          onCostUpdate={(updatedCost) => {
            setCostList(
              costList.map((costVal) =>
                costVal.id === updatedCost.id ? updatedCost : costVal
              )
            );
          }}
        />
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

      <Group className="pt-8" justify="flex-end" mt="md">
        <Button color="pink" type="submit">
          作成
        </Button>
      </Group>
    </form>
  );
};

export default NewMatterForm;
