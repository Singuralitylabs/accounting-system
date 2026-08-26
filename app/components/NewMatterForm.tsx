"use client";

import { BusinessType, CostType, MatterType } from "@/app/types/types";
import { Button, Group, LoadingOverlay, Tooltip } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState, useTransition } from "react";
import { CiSquarePlus } from "react-icons/ci";
import BusinessBlock from "./BusinessBlock";
import CostBlock from "./CostBlock";
import { MatterInfoBlock } from "./MatterInfoBlock";
import { confirmCreateMatter } from "../utils/confirmAction";
import { useRouter } from "next/navigation";
import { useAtomValue } from "jotai";
import { optionsAtom } from "../atoms/optionsAtom";
import { useCreateMatter } from "../hooks/useMatterData";

const NewMatterForm = () => {
  const initialFormValues: MatterType = {
    id: 0,
    title: "",
    category: "",
    team: "",
    start_date: "",
    description: "",
    is_fixed: false,
    has_updates: false,
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
    parent_matter_id: null,
  };

  const { teamList, categoryList, itemList, certificateList } =
    useAtomValue(optionsAtom);

  const form = useForm<MatterType>({
    mode: "uncontrolled",
    initialValues: initialFormValues,
  });

  const [costList, setCostList] = useState<CostType[]>([]);
  const [businessList, setBusinessList] = useState<BusinessType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const createMatterMutation = useCreateMatter();

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleAddCost = () => {
    const newId =
      costList.length === 0
        ? 1
        : Math.max(...costList.map((cost) => cost.id)) + 1;
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
    const newId =
      businessList.length === 0
        ? 1
        : Math.max(...businessList.map((business) => business.id)) + 1;

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
    const confirmed = await confirmCreateMatter(
      form.getValues().title,
      is_fixed,
      businessList.map((business) => business.amount),
    );
    if (!confirmed) return;

    setIsLoading(true);
    const matterInfo: MatterType = {
      id: 0,
      title: form.getValues().title,
      category: form.getValues().category,
      team: form.getValues().team,
      start_date: form.getValues().start_date,
      description: form.getValues().description,
      is_fixed: is_fixed,
      is_completed: false,
      has_updates: false,
      user_id: 1,
      accounting_memo: "",
      total_amount: 0,
      total_cost: 0,
      cost_count: costList.length,
      business_count: businessList.length,
      unchecked_cost_count: costList.length,
      parent_matter_id: null,
      inserted_at: "",
      updated_at: "",
    };
    try {
      await createMatterMutation.mutateAsync({
        matterInfo,
        businessInfoList: businessList.map((business) => ({
          ...business,
          isNew: true,
          isRemoved: false,
        })),
        costInfoList: costList.map((cost) => ({
          ...cost,
          isNew: true,
          isRemoved: false,
        })),
      });
      form.reset();
      form.setValues(initialFormValues);
      setCostList([]);
      setBusinessList([]);
      refreshData();
    } catch (error) {
      console.error("案件作成に失敗しました:", error);
    }
    setIsLoading(false);
  };

  return (
    <form
      className="p-4 w-auto"
      onSubmit={form.onSubmit(() => handleAddMatterInfo(true))}
    >
      <LoadingOverlay visible={isLoading} />
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
          variant="user"
          businessInfo={businessInfo}
          formType="new"
          index={index}
          onRemoveBusiness={handleRemoveBusiness}
          onBusinessUpdate={(updatedBusiness) => {
            setBusinessList(
              businessList.map((businessVal) =>
                businessVal.id === updatedBusiness.id
                  ? updatedBusiness
                  : businessVal,
              ),
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
          variant="user"
          costInfo={costInfo}
          itemList={itemList}
          certificateList={certificateList}
          formType="new"
          index={index}
          onRemoveCost={handleRemoveCost}
          onCostUpdate={(updatedCost) => {
            setCostList(
              costList.map((costVal) =>
                costVal.id === updatedCost.id ? updatedCost : costVal,
              ),
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
        <Tooltip label="経理に共有されますが、チェック対象外のため、案件内容を変更できます。後日、経理申請を行う必要があります。">
          <Button
            type="button"
            disabled={isLoading}
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
        </Tooltip>
        <Tooltip label="経理のチェック対象となります。申請後は取引先情報・コスト情報の新規追加のみ可能です。それ以外の変更が必要な場合には、経理に連絡する必要があります。">
          <Button color="red" disabled={isLoading} type="submit">
            経理申請
          </Button>
        </Tooltip>
      </Group>
    </form>
  );
};

export default NewMatterForm;
