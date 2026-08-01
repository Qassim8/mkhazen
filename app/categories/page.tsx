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
        title="Categories"
        subtitle={`You have ${categories?.length} main categories`}
        buttonTitle="Add Category"
      />
      <div className="grid grid-cols-4 gap-5">
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
