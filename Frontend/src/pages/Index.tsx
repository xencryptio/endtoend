// Update this page (the content is just a fallback if you fail to update the page)
import { motion } from "framer-motion";

const Index = () => {
  return (
    <motion.div
      className="min-h-dvh flex items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">Welcome to Your Blank App</h1>
        <p className="text-lg sm:text-xl text-muted-foreground">Start building your amazing project here!</p>
      </div>
    </motion.div>
  );
};

export default Index;
