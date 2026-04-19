import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Film } from "lucide-react";

const NotFound = () => (
  <Layout>
    <div className="container py-24 text-center">
      <div className="grid h-16 w-16 mx-auto place-items-center rounded-2xl bg-gradient-hero text-white shadow-playful mb-6">
        <Film className="h-8 w-8" />
      </div>
      <h1 className="font-display text-7xl font-black mb-2">404</h1>
      <p className="text-xl text-muted-foreground mb-6">This scene didn't make the final cut.</p>
      <Button asChild className="bg-gradient-hero text-white border-0 hover:opacity-90"><Link to="/">Back to home</Link></Button>
    </div>
  </Layout>
);

export default NotFound;
