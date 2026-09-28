# ChemPath Chemistry Audit

ChemPath's reaction network is designed for a **Data Structures course project**, but the chemistry layer is now curated so the graph does not rely on deliberately fake transformations.

## What "audited" means here

Each reaction record now contains:

- named reactants and products used as graph vertices,
- an equation or standard reaction scheme,
- reaction conditions / reagents,
- whether the reaction is reversible,
- a source-family key,
- an algorithmic graph weight.

The graph weight is **not** a thermodynamic, kinetic, economic, or laboratory-safety quantity. It exists only so Dijkstra has a weighted graph to operate on.

Some organic reactions are represented as standard **reaction schemes** rather than complete mechanistic equations. For example, controlled oxidation may use `[O]` to denote an oxidizing equivalent, and hydroboration-oxidation stores the reagents in the conditions field rather than creating a graph vertex for every reagent.

## Important graph-model limitation

A graph edge means:

> "This compound participates as a substrate/reactant in a documented transformation that can lead to this product under the recorded conditions."

It does **not** mean:

> "Mix only these two graph nodes together and this product will form automatically."

Catalysts, solvent, pH, temperature, pressure, selectivity, competing products, concentration, and detailed mechanism still matter.

## Source families

### S1_COMBUSTION

OpenStax, *Organic Chemistry*, 3.5 Properties of Alkanes  
https://openstax.org/books/organic-chemistry/pages/3-5-properties-of-alkanes

OpenStax, *Chemistry*, 4.5 Quantitative Chemical Analysis  
https://openstax.org/books/chemistry/pages/4-5-quantitative-chemical-analysis

Used for complete-combustion families. C/H/O-only compounds are stored with stoichiometrically balanced CO2/H2O equations.

### S2_HYDROGENATION

Chemistry LibreTexts, 9.11 Reduction of Alkenes - Catalytic Hydrogenation  
https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Map%3A_Organic_Chemistry_%28Wade%29_Complete_and_Semesters_I_and_II/Map%3A_Organic_Chemistry_I_%28Wade%29/09%3A_Reactions_of_Alkenes/9.11%3A_Reduction_of_Alkenes_-_Catalytic_Hydrogenation

Used for catalytic hydrogenation of alkenes and related unsaturated examples.

### S3_HYDROBORATION_OXIDATION

Chemistry LibreTexts, Hydroboration-Oxidation  
https://chem.libretexts.org/Ancillary_Materials/Reference/Organic_Chemistry_Glossary/Hydroboration-Oxidation

Used to map terminal 1-alkenes to the corresponding primary alcohol under anti-Markovnikov hydroboration-oxidation conditions.

### S4_ALCOHOL_OXIDATION

Chemistry LibreTexts, 12.6 Oxidation of Alcohols  
https://chem.libretexts.org/Courses/can/CHEM_231%3A_Organic_Chemistry_I_Textbook/12%3A_Alcohols/12.06%3A_Oxidation_of_Alcohols

Used for:
- primary alcohol → aldehyde,
- aldehyde → carboxylic acid,
- secondary alcohol → ketone,
- the corresponding carbonyl reductions shown as separate reduction reactions.

### S5_NITRILE_HYDROLYSIS

Chemistry LibreTexts, The Hydrolysis of Nitriles  
https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Supplemental_Modules_%28Organic_Chemistry%29/Nitriles/Reactivity_of_Nitriles/The_Hydrolysis_of_Nitriles

Used for acidic nitrile hydrolysis. The audited network explicitly retains the nitrogen-containing product as ammonium chloride instead of incorrectly showing only the carboxylic acid.

### S6_FISCHER_ESTERIFICATION

Chemistry LibreTexts, 17.05 Fischer esterification  
https://chem.libretexts.org/Courses/Purdue/Purdue%3A_Chem_26200%3A_Organic_Chemistry_II_%28Wenthold%29/Chapter_17._Carboxylic_Acids/17.05%3A_Fischer_esterification

Used for carboxylic acid + methanol ⇌ methyl ester + water. These reactions are marked reversible in the graph model.

### S7_AMINE_BASICITY

OpenStax, *Organic Chemistry*, 24.3 Basicity of Amines  
https://openstax.org/books/organic-chemistry/pages/24-3-basicity-of-amines

OpenStax, *Organic Chemistry*, 24.4 Basicity of Arylamines  
https://openstax.org/books/organic-chemistry/pages/24-4-basicity-of-arylamines

Used for:
- RNH2 + H2O ⇌ RNH3+ + OH-,
- aniline ⇌ anilinium acid-base chemistry,
- amine hydrochloride salt formation.

This specifically replaces the earlier incorrect mapping of alkylamines/aniline to ordinary NH4+.

### S8_SOLUBILITY_PRECIPITATION

OpenStax, *Chemistry 2e*, 4.2 Classifying Chemical Reactions  
https://openstax.org/books/chemistry-2e/pages/4-2-classifying-chemical-reactions

OpenStax, *Chemistry*, 15.1 Precipitation and Dissolution  
https://openstax.org/books/chemistry/pages/15-1-precipitation-and-dissolution

Used for:
- dissociation of salts covered by standard soluble-salt rules,
- classic sparingly soluble Ksp-type precipitation/dissolution equilibria such as AgCl.

The previous blanket assumption that every generated salt fully dissociates was removed.

### S9_NUCLEOPHILIC_SUBSTITUTION

OpenStax, *Organic Chemistry*, Chapter 11 introduction  
https://openstax.org/books/organic-chemistry/pages/11-why-this-chapter

OpenStax, *Organic Chemistry*, 10.5 Preparing Alkyl Halides from Alcohols  
https://openstax.org/books/organic-chemistry/pages/10-5-preparing-alkyl-halides-from-alcohols

Used for:
- primary alkyl chloride / hydroxide substitution,
- primary alcohol conversion to alkyl chloride using SOCl2.

The dataset notes that elimination can compete under some substrate/condition combinations.

### S10_ACID_BASE_EQUILIBRIA

OpenStax, *Chemistry 2e*, 14.1 Brønsted-Lowry Acids and Bases  
https://openstax.org/books/chemistry-2e/pages/14-1-bronsted-lowry-acids-and-bases

OpenStax, *Chemistry 2e*, 14.5 Polyprotic Acids  
https://openstax.org/books/chemistry-2e/pages/14-5-polyprotic-acids

OpenStax, *Chemistry 2e*, 18.9 Occurrence, Preparation, and Compounds of Oxygen  
https://openstax.org/books/chemistry-2e/pages/18-9-occurrence-preparation-and-compounds-of-oxygen

Used for carbonic-acid/bicarbonate/carbonate equilibria, sulfuric-acid stepwise ionization, nitric/nitrous acid ionization, and other explicitly aqueous acid-base reactions.

### S11_GENERAL_INORGANIC

OpenStax, *Chemistry 2e*, 18.9 Occurrence, Preparation, and Compounds of Oxygen  
https://openstax.org/books/chemistry-2e/pages/18-9-occurrence-preparation-and-compounds-of-oxygen

Used for curated inorganic oxidation/hydration examples such as SO2 → SO3.

### S12_CARBOHYDRATE_HYDROLYSIS

OpenStax, *Organic Chemistry*, 25.8 Disaccharides  
https://openstax.org/books/organic-chemistry/pages/25-8-disaccharides

Used for sucrose, maltose, and lactose hydrolysis examples.

## Reactions deliberately removed from the old dense build

Examples include:

- alkylamine → ammonium mappings,
- aniline → ammonium,
- benzaldehyde → benzene as a generic "reduction",
- chlorinated-alkane combustion written as only CO2 + H2O,
- direct H2SO4 → SO4^2- without the hydrogen-sulfate stage,
- blanket full dissociation of every generated salt,
- methane → methanol shown as a generic low-context oxidation edge,
- nitrile hydrolysis that discarded the nitrogen-containing product.

## Dataset status

The audited dataset is meant to be **chemically defensible for educational graph analysis**, not a reaction-planning database. It does not encode yields, equilibrium constants, rate constants, detailed mechanisms, stereochemical mixtures, laboratory quantities, or safety procedures.

If ChemPath is extended beyond a Data Structures project, the next chemistry upgrade should use a curated reaction database with structured stoichiometry, catalysts, temperature/pressure ranges, and persistent reaction provenance.


### S13_PEPTIDE_COUPLING

OpenStax, *Organic Chemistry*, 26.7 Peptide Synthesis  
https://openstax.org/books/organic-chemistry/pages/26-7-peptide-synthesis

Used for the ordered 20×20 set of standard-amino-acid dipeptides. ChemPath stores the atom-balanced overall condensation equation (amino acid A + amino acid B → dipeptide + H2O), while the conditions field makes clear that practical synthesis requires protected/activated amino-acid coupling rather than spontaneous mixing.

## Curated interactive network

The earlier stress-test build expanded homologous organic families through C40 and included all 400 ordered standard-amino-acid dipeptides. That scale was unnecessary for the interactive Data Structures demonstration and caused browser layout lag.

The current teaching build keeps representative chemistry through roughly C20, the core inorganic/acid-base network, common biochemical compounds, important aromatic examples, audited salt/precipitation chemistry, and a 16×16 ordered dipeptide subset. This preserves a large graph for algorithm comparison while reducing the live visualization to 688 compounds and 816 reactions.


## Compound-graph projection rule

ChemPath stores full multi-reactant reaction metadata, but the Data Structures visualization is a compound-level directed graph rather than a true reaction hypergraph.

To avoid chemically misleading shortcuts:

- the first listed reactant is the **primary substrate** used as the graph source,
- additional reactants are co-reactants/reagents and do not independently initiate graph edges,
- forward edges may point from the primary substrate to the listed products,
- for reversible records, the first listed product is the **primary product** used for the reverse edge.

This projection is intentionally conservative. A future chemistry-focused version could replace the compound graph with a reaction hypergraph/state-space search that requires all reactants before a reaction fires.
