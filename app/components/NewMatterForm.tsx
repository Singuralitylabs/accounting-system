"use client";

import { BusinessType, CostType, MatterType } from "@/app/types/types";
import { Button, Group } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState, useTransition } from "react";
import { CiSquarePlus } from "react-icons/ci";
import BusinessBlock from "./BusinessBlock";
import CostBlock from "./CostBlock";
import { MatterInfoBlock } from "./MatterInfoBlock";
import addMatterInfo from "../utils/addMatterInfo";
import { useRouter } from "next/navigation";

type Props = {
  teamList: string[];
  categoryList: string[];
  itemList: string[];
  certificateList: string[];
};

const NewMatterForm = ({
  teamList,
  categoryList,
  itemList,
  certificateList,
}: Props) => {
  const initialFormValues: MatterType = {
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
    unchecked_cost_count: 0,
  };

  const form = useForm<MatterType>({
    mode: "uncontrolled",
    initialValues: initialFormValues,
  });

  const [costList, setCostList] = useState<CostType[]>([]);
  const [businessList, setBusinessList] = useState<BusinessType[]>([]);
  const router = useRouter();
  const [_, startTransition] = useTransition();

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleAddCost = () => {
    const newId = Math.max(...costList.map((cost) => cost.id)) + 1;
    setCostList([
      ...costList,
      {
        id: newId,
        name: "",
        item: "",
        price: 0,
        certificate: "",
        comment: null,
        inserted_at: "",
        matter_id: 0,
        payment_target: "",
        period: null,
        updated_at: "",
        withholding: false,
        is_completed: false,
      },
    ]);
  };

  const handleAddBusiness = () => {
    const newId = Math.max(...businessList.map((business) => business.id)) + 1;
    setBusinessList([
      ...businessList,
      {
        id: newId,
        name: "",
        amount: 0,
        invoice_date: null,
        period_date: null,
        inserted_at: "",
        matter_id: 0,
        updated_at: "",
        is_completed: false,
      },
    ]);
  };

  const handleRemoveCost = (id: number) => {
    setCostList(costList.filter((cost) => cost.id !== id));
  };

  const handleRemoveBusiness = (id: number) => {
    setBusinessList(businessList.filter((business) => business.id !== id));
  };

  const handleAddMatterInfo = async (is_fixed: boolean) => {
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
    const ret = await addMatterInfo(matterInfo, businessList, costList);
    if (ret) {
      form.reset();
      form.setValues(initialFormValues);
      setCostList([]);
      setBusinessList([]);
      refreshData();
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
      <MatterInfoBlock
        form={form}
        teamList={teamList}
        categoryList={categoryList}
        bgColor="bg-slate-50"
      />

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
          itemList={itemList}
          certificateList={certificateList}
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
