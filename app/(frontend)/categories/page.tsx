import PageHeader from "@/components/shared/PageHeader";
import { categories } from "@/data/data";
import Card from "./components/Card";
import GenericModal from "@/components/ui/AddNewModal";
import ModalContent from "./components/ModalContent";

const Categories = () => {
  return (
    <main>
      <GenericModal modalContent={<ModalContent />} />
      <PageHeader
        title="الاصناف"
        subtitle={`لديك ${categories?.length} من الاصناف`}
        buttonTitle="اضف صنف"
      />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 my-8">
        {categories.map(({ id, color, icon, title, products }) => (
          <Card
            key={id}
            id={id}
            color={color}
            icon={icon}
            title={title}
            products={products}
          />
        ))}
      </div>
    </main>
  );
};

export default Categories;
