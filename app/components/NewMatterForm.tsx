"use client";

import { BusinessType, CostType, MatterType } from "@/app/types/types";
import { Button, Group } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import insertMatter from "../utils/insertMatter";
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

  const handleAddMatterInfo = async (is_fixed: boolean) => {
    if (is_fixed) {
      const checkCreated = window.confirm(
        `案件[${form.getValues().title}]を経理申請しますか？`
      );
      if (!checkCreated) {
        alert(`案件[${form.getValues().title}]の経理申請を中止しました。`);
        return;
      }
    } else {
      const checkCreated = window.confirm(
        `案件[${form.getValues().title}]の下書きを作成しますか？`
      );
      if (!checkCreated) {
        alert(`案件[${form.getValues().title}]の下書き作成を中止しました。`);
        return;
      }
    }

    try {
      const matterInfo: MatterType = {
        id: 0,
        title: form.getValues().title,
        category: form.getValues().category,
        team: form.getValues().team,
        start_date: form.getValues().start_date,
        description: form.getValues().description,
        is_fixed: is_fixed,
        is_completed: false,
        user_id: 1,
        accounting_memo: "",
        total_amount: 0,
        total_cost: 0,
        cost_count: costList.length,
        business_count: businessList.length,
        unchecked_cost_count: costList.length,
        inserted_at: "",
        updated_at: "",
      };

      const ret = await insertMatter(matterInfo, businessList, costList);
      if (ret) {
        if (is_fixed) {
          alert(`${matterInfo.title}の経理申請を完了しました。`);
        } else {
          alert(`${matterInfo.title}の下書き作成を完了しました。`);
        }
        form.reset();
        form.setValues(initialFormValues);
        setCostList([]);
        setBusinessList([]);
        setCostIndex(1);
        setBusinessIndex(1);
      }
    } catch (error) {
      if (is_fixed) {
        alert(`${form.getValues().title}の経理申請に失敗しました。`);
      } else {
        alert(`${form.getValues().title}の下書き作成に失敗しました。`);
      }
      console.error(error);
    }
  };

  return (
    <form
      className="p-4 w-auto"
      onSubmit={form.onSubmit(() => handleAddMatterInfo(true))}
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
        <Button
          type="button"
          onClick={() => {
            const validation = form.validate();
            if (validation.hasErrors) {
              return;
            }
            handleAddMatterInfo(false);
          }}
        >
          下書き
        </Button>
        <Button color="red" type="submit">
          経理申請
        </Button>
      </Group>
    </form>
  );
};

export default NewMatterForm;
