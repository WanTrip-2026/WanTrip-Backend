import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

// Constants logic moved from frontend
const PRIORITY_ATTRACTIONS = ["合歡山步道", "麗寶樂園", "壽山動物園"];
const EXCLUDED_ATTRACTIONS = new Set(["安平古堡", "客家園區", "客家文化園區"]);

interface AttractionWithImages {
  id: string;
  name: string;
  city: string;
  intro?: string;
  description?: string;
  address: string;
  rating: number;
  created_at: string;
  category: string | string[];
  price: number;
  attraction_images: { image_url: string; sort_order: number | null }[];
  tickets: { price: number }[];
}

const mapItem = (item: AttractionWithImages) => {
  const ticketPrices = item.tickets?.map((t) => t.price) || [];
  const minPrice =
    ticketPrices.length > 0 ? Math.min(...ticketPrices) : item.price || 0;

  return {
    id: item.id,
    name: item.name || "",
    imageUrl:
      item.attraction_images?.find((img) => img.sort_order === 1)?.image_url ||
      item.attraction_images?.[0]?.image_url ||
      "https://placehold.co/400x300?text=No+Image",
    price: minPrice,
    venue: item.city || "",
    category: Array.isArray(item.category)
      ? item.category[0] || ""
      : item.category || "",
    date: item.created_at || "2026-01-01",
    address: item.address || "",
    rating: item.rating || 0,
    description: item.intro || item.description || "",
  };
};

// GET /api/tickets/popular
router.get("/popular", async (req, res) => {
  try {
    const { data: popularData, error } = await supabase
      .from("attractions")
      .select("*, attraction_images(image_url, sort_order), tickets(price)")
      .limit(200);

    if (error) throw error;

    // Logic: One per different city
    const allPopular = (popularData as unknown as AttractionWithImages[]).map(
      mapItem
    );
    const seenCities = new Set<string>();
    const distinctCityTickets: any[] = [];

    // 1. Process Priority Items
    for (const name of PRIORITY_ATTRACTIONS) {
      const item = allPopular.find((t) => t.name === name);
      if (item && !seenCities.has(item.venue)) {
        distinctCityTickets.push(item);
        seenCities.add(item.venue);
      }
    }

    // 2. Fill the rest with distinct cities
    for (const t of allPopular) {
      if (EXCLUDED_ATTRACTIONS.has(t.name)) continue;
      if (PRIORITY_ATTRACTIONS.includes(t.name)) continue; // Already processed

      if (!seenCities.has(t.venue)) {
        seenCities.add(t.venue);
        distinctCityTickets.push(t);
      }
      if (distinctCityTickets.length >= 6) break;
    }

    res.json(distinctCityTickets);
  } catch (err: any) {
    console.error("Error fetching popular tickets:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/top-rated
router.get("/top-rated", async (req, res) => {
  try {
    const { data: topRatedData, error } = await supabase
      .from("attractions")
      .select("*, attraction_images(image_url, sort_order), tickets(price)")
      .order("rating", { ascending: false })
      .limit(200);

    if (error) throw error;

    // Logic: One per different category (項目)
    const allTopRated = (topRatedData as unknown as AttractionWithImages[]).map(
      mapItem
    );
    const seenCategories = new Set<string>();
    const distinctCategoryTickets: any[] = [];

    for (const t of allTopRated) {
      if (!seenCategories.has(t.category)) {
        seenCategories.add(t.category);
        distinctCategoryTickets.push(t);
      }
      if (distinctCategoryTickets.length >= 6) break;
    }

    res.json(distinctCategoryTickets);
  } catch (err: any) {
    console.error("Error fetching top rated tickets:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/search
router.get("/search", async (req, res) => {
  try {
    const { keyword, city, destination, category, districts, cities } =
      req.query;

    let query = supabase
      .from("attractions")
      .select("*, attraction_images(image_url, sort_order), tickets(price)");

    if (keyword) {
      query = query.ilike("name", `%${keyword}%`);
    }

    if (cities) {
      // Support 'cities' as array or comma-separated string
      const citiesArray = Array.isArray(cities)
        ? cities
        : (cities as string).split(",");

      if (citiesArray.length > 0) {
        query = query.in("city", citiesArray);
      }
    } else {
      const targetCity = (city as string) || (destination as string);
      if (
        targetCity &&
        targetCity !== "選擇城市" &&
        targetCity !== "全部城市"
      ) {
        query = query.eq("city", targetCity);
      }
    }

    if (category) {
      query = query.ilike("category", `%${category}%`);
    }

    if (districts) {
      // districts can be an array or string
      const districtsArray = Array.isArray(districts) ? districts : [districts];
      if (districtsArray.length > 0) {
        query = query.in("district", districtsArray);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    const mappedData = (data as unknown as AttractionWithImages[]).map(
      (item) => {
        const ticketPrices = item.tickets?.map((t) => t.price) || [];
        const minPrice =
          ticketPrices.length > 0 ? Math.min(...ticketPrices) : item.price || 0;

        return {
          ...item,
          price: minPrice,
          image_url:
            item.attraction_images?.find((img) => img.sort_order === 1)
              ?.image_url ||
            item.attraction_images?.[0]?.image_url ||
            "https://placehold.co/300x200?text=No+Image", // Search view format
          comments_count: 0,
        };
      }
    );

    res.json(mappedData);
  } catch (err: any) {
    console.error("Error searching tickets:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch Attraction Details
    const { data: attractionData, error: attractionError } = await supabase
      .from("attractions")
      .select("*")
      .eq("id", id)
      .single();

    if (attractionError) throw attractionError;
    if (!attractionData) {
      return res.status(404).json({ error: "Attraction not found" });
    }

    // 2. Fetch Images
    const { data: imagesData, error: imagesError } = await supabase
      .from("attraction_images")
      .select("*")
      .eq("attraction_id", id)
      .order("sort_order", { ascending: true }); // Assuming sort_order exists, or use created_at

    if (imagesError) throw imagesError;

    // 3. Fetch Available Tickets
    const { data: ticketsData, error: ticketsError } = await supabase
      .from("tickets")
      .select("*")
      .eq("attraction_id", id);

    if (ticketsError) throw ticketsError;

    // 4. Fetch Recommendations
    let recommendations: any[] = [];
    if (attractionData.category) {
      const category = Array.isArray(attractionData.category)
        ? attractionData.category[0]
        : attractionData.category;

      // Note: .contains for array column if category is array, or .ilike if string.
      // Based on existing code, category seems like it can be string or array.
      // Let's safe check based on mapItem logic which handles both.
      // Assuming database column is text array or text.
      // If it is JSONB or Array in DB, .contains is correct. If text, .ilike.
      // Let's try flexible approach or stick to what existing search uses.
      // Search uses .ilike('category', ...).

      const { data: recData } = await supabase
        .from("attractions")
        .select("*, attraction_images(image_url, sort_order), tickets(price)")
        // Use ilike for simplicity if it's text, or contains if it's array.
        // Current existing code uses .ilike for category search.
        .ilike("category", `%${category}%`)
        .neq("id", id)
        .limit(4);

      if (recData) {
        recommendations = (recData as unknown as AttractionWithImages[]).map(
          mapItem
        );
      }
    }

    res.json({
      attraction: attractionData,
      images: imagesData || [],
      tickets: ticketsData || [],
      recommendations,
    });
  } catch (err: any) {
    console.error("Error fetching ticket details:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
